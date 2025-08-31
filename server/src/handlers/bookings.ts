import { db } from '../db';
import { bookingsTable, pitchesTable, facilitiesTable, usersTable } from '../db/schema';
import { 
    type CreateBookingInput, 
    type Booking, 
    type UpdateBookingStatusInput,
    type SearchPitchesInput,
    type Pitch
} from '../schema';
import { eq, and } from 'drizzle-orm';

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
    try {
        // Verify that the player exists and is active
        const player = await db.select()
            .from(usersTable)
            .where(and(
                eq(usersTable.id, input.player_id),
                eq(usersTable.is_active, true)
            ))
            .limit(1)
            .execute();

        if (player.length === 0) {
            throw new Error('Player not found or inactive');
        }

        // Fetch pitch details to get facility_id and hourly_rate
        const pitch = await db.select()
            .from(pitchesTable)
            .innerJoin(facilitiesTable, eq(pitchesTable.facility_id, facilitiesTable.id))
            .where(and(
                eq(pitchesTable.id, input.pitch_id),
                eq(pitchesTable.is_active, true),
                eq(facilitiesTable.is_active, true)
            ))
            .limit(1)
            .execute();

        if (pitch.length === 0) {
            throw new Error('Pitch not found or inactive');
        }

        const pitchData = pitch[0].pitches;
        const facilityData = pitch[0].facilities;

        // Calculate booking duration in hours
        const [startHour, startMinute] = input.start_time.split(':').map(Number);
        const [endHour, endMinute] = input.end_time.split(':').map(Number);
        
        const startTimeInMinutes = startHour * 60 + startMinute;
        const endTimeInMinutes = endHour * 60 + endMinute;
        
        if (endTimeInMinutes <= startTimeInMinutes) {
            throw new Error('End time must be after start time');
        }
        
        const durationInHours = (endTimeInMinutes - startTimeInMinutes) / 60;
        
        // Calculate total amount
        const hourlyRate = parseFloat(pitchData.hourly_rate);
        const totalAmount = hourlyRate * durationInHours;

        // Check for conflicting bookings in the same time slot
        const bookingDate = new Date(input.booking_date).toISOString().split('T')[0];
        const conflictingBookings = await db.select()
            .from(bookingsTable)
            .where(and(
                eq(bookingsTable.pitch_id, input.pitch_id),
                eq(bookingsTable.booking_date, bookingDate),
                eq(bookingsTable.status, 'confirmed')
            ))
            .execute();

        // Check if there's a time conflict
        const hasConflict = conflictingBookings.some(booking => {
            const existingStart = booking.start_time;
            const existingEnd = booking.end_time;
            
            // Convert times to minutes for comparison
            const [existingStartHour, existingStartMinute] = existingStart.split(':').map(Number);
            const [existingEndHour, existingEndMinute] = existingEnd.split(':').map(Number);
            
            const existingStartInMinutes = existingStartHour * 60 + existingStartMinute;
            const existingEndInMinutes = existingEndHour * 60 + existingEndMinute;
            
            // Check for overlap
            return (startTimeInMinutes < existingEndInMinutes && endTimeInMinutes > existingStartInMinutes);
        });

        if (hasConflict) {
            throw new Error('Time slot conflicts with existing confirmed booking');
        }

        // Create the booking
        const result = await db.insert(bookingsTable)
            .values({
                player_id: input.player_id,
                pitch_id: input.pitch_id,
                facility_id: facilityData.id,
                booking_date: new Date(input.booking_date).toISOString().split('T')[0], // Convert to proper date format
                start_time: input.start_time,
                end_time: input.end_time,
                status: 'pending',
                total_amount: totalAmount.toString(), // Convert number to string for numeric column
                notes: input.notes
            })
            .returning()
            .execute();

        // Convert numeric and date fields back to proper types before returning
        const booking = result[0];
        return {
            ...booking,
            booking_date: new Date(booking.booking_date), // Convert date string to Date object
            start_time: booking.start_time.substring(0, 5), // Format time to HH:MM
            end_time: booking.end_time.substring(0, 5), // Format time to HH:MM
            total_amount: parseFloat(booking.total_amount) // Convert string back to number
        };
    } catch (error) {
        console.error('Booking creation failed:', error);
        throw error;
    }
}

export async function updateBookingStatus(input: UpdateBookingStatusInput): Promise<Booking> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is updating booking status (accept/reject by facility)
    // and handling payment processing for confirmed bookings.
    return Promise.resolve({} as Booking);
}

export async function getPlayerBookings(playerId: number): Promise<Booking[]> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is fetching all bookings for a specific player.
    return Promise.resolve([]);
}

export async function getFacilityBookings(facilityId: number, date?: string): Promise<Booking[]> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is fetching all bookings for a facility,
    // optionally filtered by date for calendar view.
    return Promise.resolve([]);
}

export async function searchAvailablePitches(input: SearchPitchesInput): Promise<Pitch[]> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is finding available pitches based on time slot,
    // location, type, rating, and price filters.
    return Promise.resolve([]);
}

export async function checkPlayerDailyBookingLimit(playerId: number, date: string): Promise<boolean> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is checking if player already has a confirmed
    // booking for the specified date (enforcing one booking per day rule).
    return Promise.resolve(true);
}

export async function getPendingBookings(facilityId?: number): Promise<Booking[]> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is fetching all pending bookings, optionally
    // filtered by facility for facility owner/staff view.
    return Promise.resolve([]);
}