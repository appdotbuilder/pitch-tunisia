import { db } from '../db';
import { reviewsTable, bookingsTable, facilitiesTable } from '../db/schema';
import { type Review } from '../schema';
import { eq, and, desc, avg } from 'drizzle-orm';

export async function createReview(
    playerId: number,
    facilityId: number,
    rating: number,
    comment: string | null
): Promise<Review> {
    try {
        // Verify that the player has completed a booking at this facility
        const completedBookings = await db.select()
            .from(bookingsTable)
            .where(
                and(
                    eq(bookingsTable.player_id, playerId),
                    eq(bookingsTable.facility_id, facilityId),
                    eq(bookingsTable.status, 'confirmed')
                )
            )
            .execute();

        if (completedBookings.length === 0) {
            throw new Error('You can only review facilities where you have completed bookings');
        }

        // Check if player has already reviewed this facility
        const existingReview = await db.select()
            .from(reviewsTable)
            .where(
                and(
                    eq(reviewsTable.player_id, playerId),
                    eq(reviewsTable.facility_id, facilityId)
                )
            )
            .execute();

        if (existingReview.length > 0) {
            throw new Error('You have already reviewed this facility');
        }

        // Create the review
        const result = await db.insert(reviewsTable)
            .values({
                player_id: playerId,
                facility_id: facilityId,
                rating,
                comment
            })
            .returning()
            .execute();

        const review = result[0];

        // Update facility's average rating
        await updateFacilityRating(facilityId);

        return {
            ...review
        };
    } catch (error) {
        console.error('Review creation failed:', error);
        throw error;
    }
}

export async function getFacilityReviews(
    facilityId: number,
    limit: number = 20,
    offset: number = 0
): Promise<Review[]> {
    try {
        const results = await db.select()
            .from(reviewsTable)
            .where(eq(reviewsTable.facility_id, facilityId))
            .orderBy(desc(reviewsTable.created_at))
            .limit(limit)
            .offset(offset)
            .execute();

        return results.map(review => ({
            ...review
        }));
    } catch (error) {
        console.error('Fetching facility reviews failed:', error);
        throw error;
    }
}

export async function getPlayerReviews(playerId: number): Promise<Review[]> {
    try {
        const results = await db.select()
            .from(reviewsTable)
            .where(eq(reviewsTable.player_id, playerId))
            .orderBy(desc(reviewsTable.created_at))
            .execute();

        return results.map(review => ({
            ...review
        }));
    } catch (error) {
        console.error('Fetching player reviews failed:', error);
        throw error;
    }
}

export async function updateReview(
    reviewId: number,
    playerId: number,
    rating: number,
    comment: string | null
): Promise<Review> {
    try {
        // Verify the review exists and belongs to the player
        const existingReviews = await db.select()
            .from(reviewsTable)
            .where(
                and(
                    eq(reviewsTable.id, reviewId),
                    eq(reviewsTable.player_id, playerId)
                )
            )
            .execute();

        if (existingReviews.length === 0) {
            throw new Error('Review not found or you do not have permission to update it');
        }

        const existingReview = existingReviews[0];

        // Check if review is within reasonable time frame for updates (e.g., 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        if (existingReview.created_at < thirtyDaysAgo) {
            throw new Error('Reviews can only be updated within 30 days of creation');
        }

        // Update the review
        const result = await db.update(reviewsTable)
            .set({
                rating,
                comment,
                updated_at: new Date()
            })
            .where(eq(reviewsTable.id, reviewId))
            .returning()
            .execute();

        const updatedReview = result[0];

        // Update facility's average rating
        await updateFacilityRating(existingReview.facility_id);

        return {
            ...updatedReview
        };
    } catch (error) {
        console.error('Review update failed:', error);
        throw error;
    }
}

export async function deleteReview(reviewId: number, playerId: number): Promise<void> {
    try {
        // Verify the review exists and belongs to the player
        const existingReviews = await db.select()
            .from(reviewsTable)
            .where(
                and(
                    eq(reviewsTable.id, reviewId),
                    eq(reviewsTable.player_id, playerId)
                )
            )
            .execute();

        if (existingReviews.length === 0) {
            throw new Error('Review not found or you do not have permission to delete it');
        }

        const facilityId = existingReviews[0].facility_id;

        // Delete the review
        await db.delete(reviewsTable)
            .where(eq(reviewsTable.id, reviewId))
            .execute();

        // Update facility's average rating
        await updateFacilityRating(facilityId);
    } catch (error) {
        console.error('Review deletion failed:', error);
        throw error;
    }
}

export async function calculateFacilityRating(facilityId: number): Promise<number> {
    try {
        const result = await db.select({
            averageRating: avg(reviewsTable.rating)
        })
            .from(reviewsTable)
            .where(eq(reviewsTable.facility_id, facilityId))
            .execute();

        const averageRating = result[0]?.averageRating;
        return averageRating ? parseFloat(averageRating) : 0;
    } catch (error) {
        console.error('Calculating facility rating failed:', error);
        throw error;
    }
}

// Helper function to update facility's rating in the database
async function updateFacilityRating(facilityId: number): Promise<void> {
    try {
        const averageRating = await calculateFacilityRating(facilityId);
        
        await db.update(facilitiesTable)
            .set({
                rating: averageRating,
                updated_at: new Date()
            })
            .where(eq(facilitiesTable.id, facilityId))
            .execute();
    } catch (error) {
        console.error('Updating facility rating failed:', error);
        throw error;
    }
}