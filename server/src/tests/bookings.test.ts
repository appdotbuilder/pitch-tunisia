import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, facilitiesTable, pitchesTable, bookingsTable } from '../db/schema';
import { type CreateBookingInput } from '../schema';
import { createBooking } from '../handlers/bookings';
import { eq, and } from 'drizzle-orm';

// Test users
const testPlayer = {
  username: 'test_player',
  email: 'player@test.com',
  password_hash: 'hashedpassword',
  full_name: 'Test Player',
  phone: '+1234567890',
  role: 'player' as const,
  is_active: true
};

const testFacilityOwner = {
  username: 'facility_owner',
  email: 'owner@test.com',
  password_hash: 'hashedpassword',
  full_name: 'Facility Owner',
  phone: '+1234567891',
  role: 'facility_owner' as const,
  is_active: true
};

// Test facility
const testFacility = {
  name: 'Test Sports Center',
  description: 'A great sports facility',
  address: '123 Sports St',
  city: 'Test City',
  phone: '+1234567892',
  email: 'facility@test.com',
  amenities: ['parking', 'locker_room'],
  latitude: 40.7128,
  longitude: -74.0060,
  is_active: true
};

// Test pitch
const testPitch = {
  name: 'Football Pitch 1',
  type: 'football_11' as const,
  hourly_rate: '50.00',
  description: 'Professional 11v11 football pitch',
  is_active: true
};

// Simple test input
const testInput: CreateBookingInput = {
  player_id: 1,
  pitch_id: 1,
  booking_date: '2024-12-25',
  start_time: '10:00',
  end_time: '12:00',
  notes: 'Birthday party booking'
};

describe('createBooking', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a booking successfully', async () => {
    // Create prerequisite users
    const users = await db.insert(usersTable)
      .values([testPlayer, testFacilityOwner])
      .returning()
      .execute();

    const playerId = users[0].id;
    const ownerId = users[1].id;

    // Create facility
    const facilities = await db.insert(facilitiesTable)
      .values({
        ...testFacility,
        owner_id: ownerId
      })
      .returning()
      .execute();

    const facilityId = facilities[0].id;

    // Create pitch
    const pitches = await db.insert(pitchesTable)
      .values({
        ...testPitch,
        facility_id: facilityId
      })
      .returning()
      .execute();

    const pitchId = pitches[0].id;

    // Test booking creation
    const booking = await createBooking({
      ...testInput,
      player_id: playerId,
      pitch_id: pitchId
    });

    // Validate booking fields
    expect(booking.id).toBeDefined();
    expect(booking.player_id).toEqual(playerId);
    expect(booking.pitch_id).toEqual(pitchId);
    expect(booking.facility_id).toEqual(facilityId);
    expect(booking.booking_date).toBeInstanceOf(Date);
    expect(booking.start_time).toEqual('10:00');
    expect(booking.end_time).toEqual('12:00');
    expect(booking.status).toEqual('pending');
    expect(booking.total_amount).toEqual(100); // 2 hours * 50/hour
    expect(typeof booking.total_amount).toBe('number');
    expect(booking.notes).toEqual('Birthday party booking');
    expect(booking.created_at).toBeInstanceOf(Date);
    expect(booking.updated_at).toBeInstanceOf(Date);
  });

  it('should save booking to database', async () => {
    // Create prerequisite data
    const users = await db.insert(usersTable)
      .values([testPlayer, testFacilityOwner])
      .returning()
      .execute();

    const playerId = users[0].id;
    const ownerId = users[1].id;

    const facilities = await db.insert(facilitiesTable)
      .values({
        ...testFacility,
        owner_id: ownerId
      })
      .returning()
      .execute();

    const facilityId = facilities[0].id;

    const pitches = await db.insert(pitchesTable)
      .values({
        ...testPitch,
        facility_id: facilityId
      })
      .returning()
      .execute();

    const pitchId = pitches[0].id;

    // Create booking
    const booking = await createBooking({
      ...testInput,
      player_id: playerId,
      pitch_id: pitchId
    });

    // Verify booking was saved to database
    const savedBookings = await db.select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, booking.id))
      .execute();

    expect(savedBookings).toHaveLength(1);
    expect(savedBookings[0].player_id).toEqual(playerId);
    expect(savedBookings[0].pitch_id).toEqual(pitchId);
    expect(savedBookings[0].status).toEqual('pending');
    expect(parseFloat(savedBookings[0].total_amount)).toEqual(100);
  });

  it('should calculate total amount correctly for different durations', async () => {
    // Create prerequisite data
    const users = await db.insert(usersTable)
      .values([testPlayer, testFacilityOwner])
      .returning()
      .execute();

    const playerId = users[0].id;
    const ownerId = users[1].id;

    const facilities = await db.insert(facilitiesTable)
      .values({
        ...testFacility,
        owner_id: ownerId
      })
      .returning()
      .execute();

    const facilityId = facilities[0].id;

    const pitches = await db.insert(pitchesTable)
      .values({
        ...testPitch,
        facility_id: facilityId
      })
      .returning()
      .execute();

    const pitchId = pitches[0].id;

    // Test 1.5 hour booking
    const booking = await createBooking({
      ...testInput,
      player_id: playerId,
      pitch_id: pitchId,
      start_time: '14:00',
      end_time: '15:30'
    });

    expect(booking.total_amount).toEqual(75); // 1.5 hours * 50/hour
  });

  it('should throw error for non-existent player', async () => {
    expect(createBooking({
      ...testInput,
      player_id: 999 // Non-existent player
    })).rejects.toThrow(/player not found or inactive/i);
  });

  it('should throw error for inactive player', async () => {
    // Create inactive player
    const users = await db.insert(usersTable)
      .values({
        ...testPlayer,
        is_active: false
      })
      .returning()
      .execute();

    const playerId = users[0].id;

    expect(createBooking({
      ...testInput,
      player_id: playerId
    })).rejects.toThrow(/player not found or inactive/i);
  });

  it('should throw error for non-existent pitch', async () => {
    // Create player only
    const users = await db.insert(usersTable)
      .values(testPlayer)
      .returning()
      .execute();

    const playerId = users[0].id;

    expect(createBooking({
      ...testInput,
      player_id: playerId,
      pitch_id: 999 // Non-existent pitch
    })).rejects.toThrow(/pitch not found or inactive/i);
  });

  it('should throw error for inactive pitch', async () => {
    // Create prerequisite data
    const users = await db.insert(usersTable)
      .values([testPlayer, testFacilityOwner])
      .returning()
      .execute();

    const playerId = users[0].id;
    const ownerId = users[1].id;

    const facilities = await db.insert(facilitiesTable)
      .values({
        ...testFacility,
        owner_id: ownerId
      })
      .returning()
      .execute();

    const facilityId = facilities[0].id;

    // Create inactive pitch
    const pitches = await db.insert(pitchesTable)
      .values({
        ...testPitch,
        facility_id: facilityId,
        is_active: false
      })
      .returning()
      .execute();

    const pitchId = pitches[0].id;

    expect(createBooking({
      ...testInput,
      player_id: playerId,
      pitch_id: pitchId
    })).rejects.toThrow(/pitch not found or inactive/i);
  });

  it('should throw error for invalid time range', async () => {
    // Create prerequisite data
    const users = await db.insert(usersTable)
      .values([testPlayer, testFacilityOwner])
      .returning()
      .execute();

    const playerId = users[0].id;
    const ownerId = users[1].id;

    const facilities = await db.insert(facilitiesTable)
      .values({
        ...testFacility,
        owner_id: ownerId
      })
      .returning()
      .execute();

    const facilityId = facilities[0].id;

    const pitches = await db.insert(pitchesTable)
      .values({
        ...testPitch,
        facility_id: facilityId
      })
      .returning()
      .execute();

    const pitchId = pitches[0].id;

    // Test with end time before start time
    expect(createBooking({
      ...testInput,
      player_id: playerId,
      pitch_id: pitchId,
      start_time: '15:00',
      end_time: '14:00' // End before start
    })).rejects.toThrow(/end time must be after start time/i);

    // Test with same start and end time
    expect(createBooking({
      ...testInput,
      player_id: playerId,
      pitch_id: pitchId,
      start_time: '15:00',
      end_time: '15:00' // Same time
    })).rejects.toThrow(/end time must be after start time/i);
  });

  it('should throw error for conflicting time slots', async () => {
    // Create prerequisite data
    const users = await db.insert(usersTable)
      .values([testPlayer, testFacilityOwner])
      .returning()
      .execute();

    const playerId = users[0].id;
    const ownerId = users[1].id;

    const facilities = await db.insert(facilitiesTable)
      .values({
        ...testFacility,
        owner_id: ownerId
      })
      .returning()
      .execute();

    const facilityId = facilities[0].id;

    const pitches = await db.insert(pitchesTable)
      .values({
        ...testPitch,
        facility_id: facilityId
      })
      .returning()
      .execute();

    const pitchId = pitches[0].id;

    // Create existing confirmed booking
    await db.insert(bookingsTable)
      .values({
        player_id: playerId,
        pitch_id: pitchId,
        facility_id: facilityId,
        booking_date: '2024-12-25',
        start_time: '11:00',
        end_time: '13:00',
        status: 'confirmed',
        total_amount: '100.00',
        notes: 'Existing booking'
      })
      .execute();

    // Try to create overlapping booking
    expect(createBooking({
      ...testInput,
      player_id: playerId,
      pitch_id: pitchId,
      start_time: '10:30',
      end_time: '11:30' // Overlaps with existing 11:00-13:00 booking
    })).rejects.toThrow(/time slot conflicts/i);
  });

  it('should allow booking when existing booking is not confirmed', async () => {
    // Create prerequisite data
    const users = await db.insert(usersTable)
      .values([testPlayer, testFacilityOwner])
      .returning()
      .execute();

    const playerId = users[0].id;
    const ownerId = users[1].id;

    const facilities = await db.insert(facilitiesTable)
      .values({
        ...testFacility,
        owner_id: ownerId
      })
      .returning()
      .execute();

    const facilityId = facilities[0].id;

    const pitches = await db.insert(pitchesTable)
      .values({
        ...testPitch,
        facility_id: facilityId
      })
      .returning()
      .execute();

    const pitchId = pitches[0].id;

    // Create existing pending booking (not confirmed)
    await db.insert(bookingsTable)
      .values({
        player_id: playerId,
        pitch_id: pitchId,
        facility_id: facilityId,
        booking_date: '2024-12-25',
        start_time: '11:00',
        end_time: '13:00',
        status: 'pending', // Not confirmed
        total_amount: '100.00',
        notes: 'Pending booking'
      })
      .execute();

    // Should allow overlapping booking when existing is not confirmed
    const booking = await createBooking({
      ...testInput,
      player_id: playerId,
      pitch_id: pitchId,
      start_time: '10:30',
      end_time: '11:30'
    });

    expect(booking.id).toBeDefined();
    expect(booking.status).toEqual('pending');
  });

  it('should handle bookings with null notes', async () => {
    // Create prerequisite data
    const users = await db.insert(usersTable)
      .values([testPlayer, testFacilityOwner])
      .returning()
      .execute();

    const playerId = users[0].id;
    const ownerId = users[1].id;

    const facilities = await db.insert(facilitiesTable)
      .values({
        ...testFacility,
        owner_id: ownerId
      })
      .returning()
      .execute();

    const facilityId = facilities[0].id;

    const pitches = await db.insert(pitchesTable)
      .values({
        ...testPitch,
        facility_id: facilityId
      })
      .returning()
      .execute();

    const pitchId = pitches[0].id;

    // Create booking with null notes
    const booking = await createBooking({
      ...testInput,
      player_id: playerId,
      pitch_id: pitchId,
      notes: null
    });

    expect(booking.notes).toBeNull();
  });
});