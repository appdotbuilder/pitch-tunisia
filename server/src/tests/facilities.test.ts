import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, facilitiesTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { type CreateFacilityInput } from '../schema';
import { createFacility } from '../handlers/facilities';

describe('createFacility', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a facility with valid owner', async () => {
    // Create a facility owner first
    const ownerResult = await db.insert(usersTable)
      .values({
        username: 'facility_owner',
        email: 'owner@example.com',
        password_hash: 'hashedpassword',
        full_name: 'Facility Owner',
        role: 'facility_owner'
      })
      .returning()
      .execute();

    const owner = ownerResult[0];

    const testInput: CreateFacilityInput = {
      owner_id: owner.id,
      name: 'Test Sports Center',
      description: 'A modern sports facility',
      address: '123 Sports Street',
      city: 'Tunis',
      phone: '+216 12 345 678',
      email: 'facility@example.com',
      amenities: ['parking', 'changing_rooms', 'wifi'],
      latitude: 36.8065,
      longitude: 10.1815
    };

    const result = await createFacility(testInput);

    // Basic field validation
    expect(result.name).toEqual('Test Sports Center');
    expect(result.description).toEqual('A modern sports facility');
    expect(result.address).toEqual('123 Sports Street');
    expect(result.city).toEqual('Tunis');
    expect(result.phone).toEqual('+216 12 345 678');
    expect(result.email).toEqual('facility@example.com');
    expect(result.amenities).toEqual(['parking', 'changing_rooms', 'wifi']);
    expect(result.latitude).toEqual(36.8065);
    expect(result.longitude).toEqual(10.1815);
    expect(result.owner_id).toEqual(owner.id);
    expect(result.rating).toBeNull();
    expect(result.is_active).toBe(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save facility to database', async () => {
    // Create a facility owner first
    const ownerResult = await db.insert(usersTable)
      .values({
        username: 'facility_owner2',
        email: 'owner2@example.com',
        password_hash: 'hashedpassword',
        full_name: 'Facility Owner 2',
        role: 'facility_owner'
      })
      .returning()
      .execute();

    const owner = ownerResult[0];

    const testInput: CreateFacilityInput = {
      owner_id: owner.id,
      name: 'Sports Complex',
      description: 'Large sports complex',
      address: '456 Complex Ave',
      city: 'Sfax',
      phone: null,
      email: null,
      amenities: ['gym', 'pool'],
      latitude: null,
      longitude: null
    };

    const result = await createFacility(testInput);

    // Query database to verify facility was saved
    const facilities = await db.select()
      .from(facilitiesTable)
      .where(eq(facilitiesTable.id, result.id))
      .execute();

    expect(facilities).toHaveLength(1);
    expect(facilities[0].name).toEqual('Sports Complex');
    expect(facilities[0].description).toEqual('Large sports complex');
    expect(facilities[0].address).toEqual('456 Complex Ave');
    expect(facilities[0].city).toEqual('Sfax');
    expect(facilities[0].phone).toBeNull();
    expect(facilities[0].email).toBeNull();
    expect(facilities[0].amenities).toEqual(['gym', 'pool']);
    expect(facilities[0].latitude).toBeNull();
    expect(facilities[0].longitude).toBeNull();
    expect(facilities[0].owner_id).toEqual(owner.id);
    expect(facilities[0].is_active).toBe(true);
    expect(facilities[0].created_at).toBeInstanceOf(Date);
  });

  it('should throw error when owner does not exist', async () => {
    const testInput: CreateFacilityInput = {
      owner_id: 999, // Non-existent owner ID
      name: 'Test Facility',
      description: 'Test description',
      address: '123 Test St',
      city: 'Test City',
      phone: null,
      email: null,
      amenities: [],
      latitude: null,
      longitude: null
    };

    await expect(createFacility(testInput)).rejects.toThrow(/owner not found/i);
  });

  it('should throw error when user is not a facility owner', async () => {
    // Create a regular player user
    const userResult = await db.insert(usersTable)
      .values({
        username: 'regular_player',
        email: 'player@example.com',
        password_hash: 'hashedpassword',
        full_name: 'Regular Player',
        role: 'player'
      })
      .returning()
      .execute();

    const user = userResult[0];

    const testInput: CreateFacilityInput = {
      owner_id: user.id,
      name: 'Test Facility',
      description: 'Test description',
      address: '123 Test St',
      city: 'Test City',
      phone: null,
      email: null,
      amenities: [],
      latitude: null,
      longitude: null
    };

    await expect(createFacility(testInput)).rejects.toThrow(/not a facility owner/i);
  });

  it('should handle empty amenities array', async () => {
    // Create a facility owner first
    const ownerResult = await db.insert(usersTable)
      .values({
        username: 'owner_empty_amenities',
        email: 'owner3@example.com',
        password_hash: 'hashedpassword',
        full_name: 'Facility Owner 3',
        role: 'facility_owner'
      })
      .returning()
      .execute();

    const owner = ownerResult[0];

    const testInput: CreateFacilityInput = {
      owner_id: owner.id,
      name: 'Minimal Facility',
      description: null,
      address: '789 Minimal St',
      city: 'Monastir',
      phone: null,
      email: null,
      amenities: [], // Empty amenities
      latitude: null,
      longitude: null
    };

    const result = await createFacility(testInput);

    expect(result.amenities).toEqual([]);
    expect(result.description).toBeNull();
  });

  it('should create facility with multiple amenities', async () => {
    // Create a facility owner first
    const ownerResult = await db.insert(usersTable)
      .values({
        username: 'owner_multiple_amenities',
        email: 'owner4@example.com',
        password_hash: 'hashedpassword',
        full_name: 'Facility Owner 4',
        role: 'facility_owner'
      })
      .returning()
      .execute();

    const owner = ownerResult[0];

    const testInput: CreateFacilityInput = {
      owner_id: owner.id,
      name: 'Premium Sports Center',
      description: 'Premium facility with all amenities',
      address: '100 Premium Blvd',
      city: 'Sousse',
      phone: '+216 98 765 432',
      email: 'premium@example.com',
      amenities: ['parking', 'changing_rooms', 'wifi', 'cafeteria', 'gym', 'sauna', 'pool'],
      latitude: 35.8256,
      longitude: 10.6411
    };

    const result = await createFacility(testInput);

    expect(result.amenities).toEqual([
      'parking', 
      'changing_rooms', 
      'wifi', 
      'cafeteria', 
      'gym', 
      'sauna', 
      'pool'
    ]);

    // Verify in database
    const facilities = await db.select()
      .from(facilitiesTable)
      .where(eq(facilitiesTable.id, result.id))
      .execute();

    expect(facilities[0].amenities).toEqual([
      'parking', 
      'changing_rooms', 
      'wifi', 
      'cafeteria', 
      'gym', 
      'sauna', 
      'pool'
    ]);
  });
});