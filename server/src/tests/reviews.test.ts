import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, facilitiesTable, pitchesTable, bookingsTable, reviewsTable } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import {
    createReview,
    getFacilityReviews,
    getPlayerReviews,
    updateReview,
    deleteReview,
    calculateFacilityRating
} from '../handlers/reviews';

describe('reviews', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    let playerId: number;
    let facilityId: number;
    let pitchId: number;

    beforeEach(async () => {
        // Create test user (player)
        const playerResult = await db.insert(usersTable)
            .values({
                username: 'testplayer',
                email: 'player@test.com',
                password_hash: 'hashedpassword',
                full_name: 'Test Player',
                role: 'player'
            })
            .returning()
            .execute();
        playerId = playerResult[0].id;

        // Create facility owner
        const ownerResult = await db.insert(usersTable)
            .values({
                username: 'facilityowner',
                email: 'owner@test.com',
                password_hash: 'hashedpassword',
                full_name: 'Facility Owner',
                role: 'facility_owner'
            })
            .returning()
            .execute();

        // Create test facility
        const facilityResult = await db.insert(facilitiesTable)
            .values({
                owner_id: ownerResult[0].id,
                name: 'Test Facility',
                address: '123 Test St',
                city: 'Test City',
                amenities: ['parking', 'changing_rooms']
            })
            .returning()
            .execute();
        facilityId = facilityResult[0].id;

        // Create test pitch
        const pitchResult = await db.insert(pitchesTable)
            .values({
                facility_id: facilityId,
                name: 'Test Pitch',
                type: 'football_11',
                hourly_rate: '50.00'
            })
            .returning()
            .execute();
        pitchId = pitchResult[0].id;
    });

    describe('createReview', () => {
        it('should create a review after completed booking', async () => {
            // Create a confirmed booking first
            await db.insert(bookingsTable)
                .values({
                    player_id: playerId,
                    pitch_id: pitchId,
                    facility_id: facilityId,
                    booking_date: '2024-01-15',
                    start_time: '10:00',
                    end_time: '11:00',
                    status: 'confirmed',
                    total_amount: '50.00'
                })
                .execute();

            const result = await createReview(playerId, facilityId, 5, 'Great facility!');

            expect(result.id).toBeDefined();
            expect(result.player_id).toEqual(playerId);
            expect(result.facility_id).toEqual(facilityId);
            expect(result.rating).toEqual(5);
            expect(result.comment).toEqual('Great facility!');
            expect(result.created_at).toBeInstanceOf(Date);
            expect(result.updated_at).toBeInstanceOf(Date);
        });

        it('should reject review without completed booking', async () => {
            expect(createReview(playerId, facilityId, 5, 'Great facility!'))
                .rejects.toThrow(/completed bookings/i);
        });

        it('should reject duplicate review from same player', async () => {
            // Create a confirmed booking first
            await db.insert(bookingsTable)
                .values({
                    player_id: playerId,
                    pitch_id: pitchId,
                    facility_id: facilityId,
                    booking_date: '2024-01-15',
                    start_time: '10:00',
                    end_time: '11:00',
                    status: 'confirmed',
                    total_amount: '50.00'
                })
                .execute();

            // Create first review
            await createReview(playerId, facilityId, 5, 'Great facility!');

            // Try to create duplicate review
            expect(createReview(playerId, facilityId, 4, 'Actually not so great'))
                .rejects.toThrow(/already reviewed/i);
        });

        it('should update facility rating after creating review', async () => {
            // Create a confirmed booking first
            await db.insert(bookingsTable)
                .values({
                    player_id: playerId,
                    pitch_id: pitchId,
                    facility_id: facilityId,
                    booking_date: '2024-01-15',
                    start_time: '10:00',
                    end_time: '11:00',
                    status: 'confirmed',
                    total_amount: '50.00'
                })
                .execute();

            await createReview(playerId, facilityId, 5, 'Great facility!');

            // Check that facility rating was updated
            const facilities = await db.select()
                .from(facilitiesTable)
                .where(eq(facilitiesTable.id, facilityId))
                .execute();

            expect(facilities[0].rating).toEqual(5);
        });
    });

    describe('getFacilityReviews', () => {
        it('should fetch paginated facility reviews', async () => {
            // Create confirmed booking
            await db.insert(bookingsTable)
                .values({
                    player_id: playerId,
                    pitch_id: pitchId,
                    facility_id: facilityId,
                    booking_date: '2024-01-15',
                    start_time: '10:00',
                    end_time: '11:00',
                    status: 'confirmed',
                    total_amount: '50.00'
                })
                .execute();

            // Create multiple reviews with different players
            const player2Result = await db.insert(usersTable)
                .values({
                    username: 'player2',
                    email: 'player2@test.com',
                    password_hash: 'hashedpassword',
                    full_name: 'Player Two',
                    role: 'player'
                })
                .returning()
                .execute();

            // Create booking for second player
            await db.insert(bookingsTable)
                .values({
                    player_id: player2Result[0].id,
                    pitch_id: pitchId,
                    facility_id: facilityId,
                    booking_date: '2024-01-16',
                    start_time: '10:00',
                    end_time: '11:00',
                    status: 'confirmed',
                    total_amount: '50.00'
                })
                .execute();

            await createReview(playerId, facilityId, 5, 'Great facility!');
            await createReview(player2Result[0].id, facilityId, 4, 'Good facility');

            const reviews = await getFacilityReviews(facilityId, 10, 0);

            expect(reviews).toHaveLength(2);
            expect(reviews[0].rating).toEqual(4); // Most recent first
            expect(reviews[1].rating).toEqual(5);
        });

        it('should handle pagination correctly', async () => {
            // Create confirmed booking
            await db.insert(bookingsTable)
                .values({
                    player_id: playerId,
                    pitch_id: pitchId,
                    facility_id: facilityId,
                    booking_date: '2024-01-15',
                    start_time: '10:00',
                    end_time: '11:00',
                    status: 'confirmed',
                    total_amount: '50.00'
                })
                .execute();

            await createReview(playerId, facilityId, 5, 'Great facility!');

            // Test limit
            const limitedReviews = await getFacilityReviews(facilityId, 1, 0);
            expect(limitedReviews).toHaveLength(1);

            // Test offset
            const offsetReviews = await getFacilityReviews(facilityId, 10, 1);
            expect(offsetReviews).toHaveLength(0);
        });
    });

    describe('getPlayerReviews', () => {
        it('should fetch all reviews by a player', async () => {
            // Create second facility
            const facility2Result = await db.insert(facilitiesTable)
                .values({
                    owner_id: playerId, // Using player as owner for simplicity
                    name: 'Second Facility',
                    address: '456 Test Ave',
                    city: 'Test City',
                    amenities: ['parking']
                })
                .returning()
                .execute();

            const pitch2Result = await db.insert(pitchesTable)
                .values({
                    facility_id: facility2Result[0].id,
                    name: 'Second Pitch',
                    type: 'football_7',
                    hourly_rate: '40.00'
                })
                .returning()
                .execute();

            // Create bookings for both facilities
            await db.insert(bookingsTable)
                .values({
                    player_id: playerId,
                    pitch_id: pitchId,
                    facility_id: facilityId,
                    booking_date: '2024-01-15',
                    start_time: '10:00',
                    end_time: '11:00',
                    status: 'confirmed',
                    total_amount: '50.00'
                })
                .execute();

            await db.insert(bookingsTable)
                .values({
                    player_id: playerId,
                    pitch_id: pitch2Result[0].id,
                    facility_id: facility2Result[0].id,
                    booking_date: '2024-01-16',
                    start_time: '14:00',
                    end_time: '15:00',
                    status: 'confirmed',
                    total_amount: '40.00'
                })
                .execute();

            // Create reviews for both facilities
            await createReview(playerId, facilityId, 5, 'Great facility!');
            await createReview(playerId, facility2Result[0].id, 4, 'Good facility');

            const reviews = await getPlayerReviews(playerId);

            expect(reviews).toHaveLength(2);
            expect(reviews.map(r => r.facility_id).sort()).toEqual([facilityId, facility2Result[0].id].sort());
        });
    });

    describe('updateReview', () => {
        let reviewId: number;

        beforeEach(async () => {
            // Create confirmed booking and review
            await db.insert(bookingsTable)
                .values({
                    player_id: playerId,
                    pitch_id: pitchId,
                    facility_id: facilityId,
                    booking_date: '2024-01-15',
                    start_time: '10:00',
                    end_time: '11:00',
                    status: 'confirmed',
                    total_amount: '50.00'
                })
                .execute();

            const review = await createReview(playerId, facilityId, 5, 'Great facility!');
            reviewId = review.id;
        });

        it('should update own review successfully', async () => {
            const result = await updateReview(reviewId, playerId, 4, 'Updated comment');

            expect(result.id).toEqual(reviewId);
            expect(result.rating).toEqual(4);
            expect(result.comment).toEqual('Updated comment');
            expect(result.updated_at).toBeInstanceOf(Date);
        });

        it('should reject update from different player', async () => {
            const otherPlayerResult = await db.insert(usersTable)
                .values({
                    username: 'otherplayer',
                    email: 'other@test.com',
                    password_hash: 'hashedpassword',
                    full_name: 'Other Player',
                    role: 'player'
                })
                .returning()
                .execute();

            expect(updateReview(reviewId, otherPlayerResult[0].id, 3, 'Hacked!'))
                .rejects.toThrow(/not found or you do not have permission/i);
        });

        it('should reject update of old reviews', async () => {
            // Manually set review creation date to 31 days ago
            const thirtyOneDaysAgo = new Date();
            thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);
            
            await db.update(reviewsTable)
                .set({ created_at: thirtyOneDaysAgo })
                .where(eq(reviewsTable.id, reviewId))
                .execute();

            expect(updateReview(reviewId, playerId, 3, 'Too late'))
                .rejects.toThrow(/within 30 days/i);
        });
    });

    describe('deleteReview', () => {
        let reviewId: number;

        beforeEach(async () => {
            // Create confirmed booking and review
            await db.insert(bookingsTable)
                .values({
                    player_id: playerId,
                    pitch_id: pitchId,
                    facility_id: facilityId,
                    booking_date: '2024-01-15',
                    start_time: '10:00',
                    end_time: '11:00',
                    status: 'confirmed',
                    total_amount: '50.00'
                })
                .execute();

            const review = await createReview(playerId, facilityId, 5, 'Great facility!');
            reviewId = review.id;
        });

        it('should delete own review successfully', async () => {
            await deleteReview(reviewId, playerId);

            // Verify review was deleted
            const reviews = await db.select()
                .from(reviewsTable)
                .where(eq(reviewsTable.id, reviewId))
                .execute();

            expect(reviews).toHaveLength(0);
        });

        it('should reject deletion from different player', async () => {
            const otherPlayerResult = await db.insert(usersTable)
                .values({
                    username: 'otherplayer',
                    email: 'other@test.com',
                    password_hash: 'hashedpassword',
                    full_name: 'Other Player',
                    role: 'player'
                })
                .returning()
                .execute();

            expect(deleteReview(reviewId, otherPlayerResult[0].id))
                .rejects.toThrow(/not found or you do not have permission/i);
        });

        it('should update facility rating after deletion', async () => {
            await deleteReview(reviewId, playerId);

            // Check that facility rating was updated to 0 (no reviews)
            const facilities = await db.select()
                .from(facilitiesTable)
                .where(eq(facilitiesTable.id, facilityId))
                .execute();

            expect(facilities[0].rating).toEqual(0);
        });
    });

    describe('calculateFacilityRating', () => {
        it('should calculate average rating correctly', async () => {
            // Create multiple players and bookings
            const players = [];
            for (let i = 0; i < 3; i++) {
                const playerResult = await db.insert(usersTable)
                    .values({
                        username: `player${i}`,
                        email: `player${i}@test.com`,
                        password_hash: 'hashedpassword',
                        full_name: `Player ${i}`,
                        role: 'player'
                    })
                    .returning()
                    .execute();
                players.push(playerResult[0].id);

                // Create booking for each player
                await db.insert(bookingsTable)
                    .values({
                        player_id: playerResult[0].id,
                        pitch_id: pitchId,
                        facility_id: facilityId,
                        booking_date: `2024-01-${15 + i}`,
                        start_time: '10:00',
                        end_time: '11:00',
                        status: 'confirmed',
                        total_amount: '50.00'
                    })
                    .execute();
            }

            // Create reviews with ratings 3, 4, 5
            await createReview(players[0], facilityId, 3, 'Okay facility');
            await createReview(players[1], facilityId, 4, 'Good facility');
            await createReview(players[2], facilityId, 5, 'Great facility');

            const averageRating = await calculateFacilityRating(facilityId);

            expect(averageRating).toEqual(4); // (3 + 4 + 5) / 3 = 4
        });

        it('should return 0 for facility with no reviews', async () => {
            const averageRating = await calculateFacilityRating(facilityId);
            expect(averageRating).toEqual(0);
        });
    });
});