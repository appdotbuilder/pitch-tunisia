import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, tournamentsTable } from '../db/schema';
import { type CreateTournamentInput } from '../schema';
import { createTournament } from '../handlers/tournaments';
import { eq } from 'drizzle-orm';

// Test user data
const testOrganizer = {
  username: 'tournament_org',
  email: 'organizer@test.com',
  password_hash: 'hashedpassword123',
  full_name: 'Tournament Organizer',
  phone: '+1234567890',
  role: 'tournament_organizer' as const,
  is_active: true
};

const testPlayer = {
  username: 'regular_player',
  email: 'player@test.com',
  password_hash: 'hashedpassword123',
  full_name: 'Regular Player',
  phone: '+1234567891',
  role: 'player' as const,
  is_active: true
};

const testAdmin = {
  username: 'admin_user',
  email: 'admin@test.com',
  password_hash: 'hashedpassword123',
  full_name: 'Admin User',
  phone: '+1234567892',
  role: 'admin' as const,
  is_active: true
};

// Simple test tournament input
const testTournamentInput: CreateTournamentInput = {
  organizer_id: 1, // Will be updated in tests
  name: 'Test Tournament',
  description: 'A tournament for testing',
  bracket_type: 'single_elimination',
  entry_fee: 25.50,
  max_participants: 16,
  registration_start: '2024-12-01T00:00:00Z',
  registration_end: '2024-12-15T23:59:59Z',
  tournament_start: '2024-12-20T09:00:00Z',
  tournament_end: '2024-12-22T18:00:00Z',
  rules: 'Standard tournament rules apply',
  prize_pool: 400.0
};

describe('createTournament', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a tournament with valid organizer', async () => {
    // Create test organizer
    const organizerResult = await db.insert(usersTable)
      .values(testOrganizer)
      .returning()
      .execute();
    
    const organizer = organizerResult[0];
    const input = { ...testTournamentInput, organizer_id: organizer.id };
    
    const result = await createTournament(input);

    // Basic field validation
    expect(result.name).toEqual('Test Tournament');
    expect(result.description).toEqual(testTournamentInput.description);
    expect(result.bracket_type).toEqual('single_elimination');
    expect(result.entry_fee).toEqual(25.50);
    expect(typeof result.entry_fee).toEqual('number');
    expect(result.max_participants).toEqual(16);
    expect(result.status).toEqual('draft');
    expect(result.rules).toEqual(testTournamentInput.rules);
    expect(result.prize_pool).toEqual(400.0);
    expect(typeof result.prize_pool).toEqual('number');
    expect(result.organizer_id).toEqual(organizer.id);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should handle admin as organizer', async () => {
    // Create test admin
    const adminResult = await db.insert(usersTable)
      .values(testAdmin)
      .returning()
      .execute();
    
    const admin = adminResult[0];
    const input = { ...testTournamentInput, organizer_id: admin.id };
    
    const result = await createTournament(input);

    expect(result.name).toEqual('Test Tournament');
    expect(result.organizer_id).toEqual(admin.id);
    expect(result.status).toEqual('draft');
  });

  it('should save tournament to database', async () => {
    // Create test organizer
    const organizerResult = await db.insert(usersTable)
      .values(testOrganizer)
      .returning()
      .execute();
    
    const organizer = organizerResult[0];
    const input = { ...testTournamentInput, organizer_id: organizer.id };
    
    const result = await createTournament(input);

    // Query using proper drizzle syntax
    const tournaments = await db.select()
      .from(tournamentsTable)
      .where(eq(tournamentsTable.id, result.id))
      .execute();

    expect(tournaments).toHaveLength(1);
    expect(tournaments[0].name).toEqual('Test Tournament');
    expect(tournaments[0].organizer_id).toEqual(organizer.id);
    expect(tournaments[0].bracket_type).toEqual('single_elimination');
    expect(parseFloat(tournaments[0].entry_fee)).toEqual(25.50);
    expect(tournaments[0].max_participants).toEqual(16);
    expect(tournaments[0].status).toEqual('draft');
    expect(tournaments[0].created_at).toBeInstanceOf(Date);
    expect(tournaments[0].updated_at).toBeInstanceOf(Date);
  });

  it('should handle null prize_pool correctly', async () => {
    // Create test organizer
    const organizerResult = await db.insert(usersTable)
      .values(testOrganizer)
      .returning()
      .execute();
    
    const organizer = organizerResult[0];
    const input = { 
      ...testTournamentInput, 
      organizer_id: organizer.id,
      prize_pool: null
    };
    
    const result = await createTournament(input);

    expect(result.prize_pool).toBeNull();
    
    // Verify in database
    const tournaments = await db.select()
      .from(tournamentsTable)
      .where(eq(tournamentsTable.id, result.id))
      .execute();

    expect(tournaments[0].prize_pool).toBeNull();
  });

  it('should handle zero entry fee', async () => {
    // Create test organizer
    const organizerResult = await db.insert(usersTable)
      .values(testOrganizer)
      .returning()
      .execute();
    
    const organizer = organizerResult[0];
    const input = { 
      ...testTournamentInput, 
      organizer_id: organizer.id,
      entry_fee: 0
    };
    
    const result = await createTournament(input);

    expect(result.entry_fee).toEqual(0);
    expect(typeof result.entry_fee).toEqual('number');
  });

  it('should reject non-existent organizer', async () => {
    const input = { ...testTournamentInput, organizer_id: 99999 };
    
    await expect(createTournament(input)).rejects.toThrow(/User with ID 99999 not found/i);
  });

  it('should reject organizer without permission', async () => {
    // Create test player (without tournament organizer role)
    const playerResult = await db.insert(usersTable)
      .values(testPlayer)
      .returning()
      .execute();
    
    const player = playerResult[0];
    const input = { ...testTournamentInput, organizer_id: player.id };
    
    await expect(createTournament(input)).rejects.toThrow(/User does not have permission to organize tournaments/i);
  });

  it('should handle different bracket types', async () => {
    // Create test organizer
    const organizerResult = await db.insert(usersTable)
      .values(testOrganizer)
      .returning()
      .execute();
    
    const organizer = organizerResult[0];
    const input = { 
      ...testTournamentInput, 
      organizer_id: organizer.id,
      bracket_type: 'round_robin' as const
    };
    
    const result = await createTournament(input);

    expect(result.bracket_type).toEqual('round_robin');
  });

  it('should parse date strings correctly', async () => {
    // Create test organizer
    const organizerResult = await db.insert(usersTable)
      .values(testOrganizer)
      .returning()
      .execute();
    
    const organizer = organizerResult[0];
    const input = { ...testTournamentInput, organizer_id: organizer.id };
    
    const result = await createTournament(input);

    expect(result.registration_start).toBeInstanceOf(Date);
    expect(result.registration_end).toBeInstanceOf(Date);
    expect(result.tournament_start).toBeInstanceOf(Date);
    expect(result.tournament_end).toBeInstanceOf(Date);
    
    // Verify dates are parsed correctly
    expect(result.registration_start.getFullYear()).toEqual(2024);
    expect(result.registration_start.getMonth()).toEqual(11); // December (0-indexed)
    expect(result.registration_start.getDate()).toEqual(1);
  });

  it('should handle null description', async () => {
    // Create test organizer
    const organizerResult = await db.insert(usersTable)
      .values(testOrganizer)
      .returning()
      .execute();
    
    const organizer = organizerResult[0];
    const input = { 
      ...testTournamentInput, 
      organizer_id: organizer.id,
      description: null
    };
    
    const result = await createTournament(input);

    expect(result.description).toBeNull();
  });
});