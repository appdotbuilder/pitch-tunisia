import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  facilitiesTable, 
  bookingsTable, 
  pitchesTable,
  tournamentsTable,
  walletsTable,
  walletTransactionsTable
} from '../db/schema';
import {
  getAllUsers,
  updateUserStatus,
  updateUserRole,
  getPendingTournamentApprovals,
  approveTournament,
  getPlatformStatistics,
  getFinancialSettlements,
  setMaxNegativeBalance,
  adjustWalletBalance,
  getTournamentOrganizerApplications
} from '../handlers/admin';
import { eq } from 'drizzle-orm';

describe('Admin Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getAllUsers', () => {
    it('should get all users without filters', async () => {
      // Create test users
      await db.insert(usersTable).values([
        {
          username: 'admin1',
          email: 'admin@test.com',
          password_hash: 'hash1',
          full_name: 'Admin User',
          role: 'admin',
          is_active: true
        },
        {
          username: 'player1',
          email: 'player@test.com',
          password_hash: 'hash2',
          full_name: 'Player User',
          role: 'player',
          is_active: false
        }
      ]).execute();

      const result = await getAllUsers();

      expect(result).toHaveLength(2);
      expect(result[0].username).toEqual('admin1');
      expect(result[0].role).toEqual('admin');
      expect(result[1].username).toEqual('player1');
      expect(result[1].role).toEqual('player');
    });

    it('should filter users by role', async () => {
      await db.insert(usersTable).values([
        {
          username: 'admin1',
          email: 'admin@test.com',
          password_hash: 'hash1',
          full_name: 'Admin User',
          role: 'admin',
          is_active: true
        },
        {
          username: 'player1',
          email: 'player@test.com',
          password_hash: 'hash2',
          full_name: 'Player User',
          role: 'player',
          is_active: true
        }
      ]).execute();

      const result = await getAllUsers('admin');

      expect(result).toHaveLength(1);
      expect(result[0].role).toEqual('admin');
    });

    it('should filter users by active status', async () => {
      await db.insert(usersTable).values([
        {
          username: 'active1',
          email: 'active@test.com',
          password_hash: 'hash1',
          full_name: 'Active User',
          role: 'player',
          is_active: true
        },
        {
          username: 'inactive1',
          email: 'inactive@test.com',
          password_hash: 'hash2',
          full_name: 'Inactive User',
          role: 'player',
          is_active: false
        }
      ]).execute();

      const result = await getAllUsers(undefined, true);

      expect(result).toHaveLength(1);
      expect(result[0].is_active).toEqual(true);
    });

    it('should filter users by both role and active status', async () => {
      await db.insert(usersTable).values([
        {
          username: 'admin_active',
          email: 'admin_active@test.com',
          password_hash: 'hash1',
          full_name: 'Active Admin',
          role: 'admin',
          is_active: true
        },
        {
          username: 'admin_inactive',
          email: 'admin_inactive@test.com',
          password_hash: 'hash2',
          full_name: 'Inactive Admin',
          role: 'admin',
          is_active: false
        },
        {
          username: 'player_active',
          email: 'player_active@test.com',
          password_hash: 'hash3',
          full_name: 'Active Player',
          role: 'player',
          is_active: true
        }
      ]).execute();

      const result = await getAllUsers('admin', true);

      expect(result).toHaveLength(1);
      expect(result[0].role).toEqual('admin');
      expect(result[0].is_active).toEqual(true);
    });
  });

  describe('updateUserStatus', () => {
    it('should update user status successfully', async () => {
      const [user] = await db.insert(usersTable).values({
        username: 'testuser',
        email: 'test@test.com',
        password_hash: 'hash1',
        full_name: 'Test User',
        role: 'player',
        is_active: true
      }).returning().execute();

      const result = await updateUserStatus(user.id, false);

      expect(result.id).toEqual(user.id);
      expect(result.is_active).toEqual(false);

      // Verify in database
      const [updatedUser] = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .execute();

      expect(updatedUser.is_active).toEqual(false);
    });

    it('should throw error for non-existent user', async () => {
      await expect(updateUserStatus(999, false)).rejects.toThrow('User not found');
    });
  });

  describe('updateUserRole', () => {
    it('should update user role successfully', async () => {
      const [user] = await db.insert(usersTable).values({
        username: 'testuser',
        email: 'test@test.com',
        password_hash: 'hash1',
        full_name: 'Test User',
        role: 'player',
        is_active: true
      }).returning().execute();

      const result = await updateUserRole(user.id, 'tournament_organizer');

      expect(result.id).toEqual(user.id);
      expect(result.role).toEqual('tournament_organizer');

      // Verify in database
      const [updatedUser] = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .execute();

      expect(updatedUser.role).toEqual('tournament_organizer');
    });

    it('should throw error for non-existent user', async () => {
      await expect(updateUserRole(999, 'admin')).rejects.toThrow('User not found');
    });
  });

  describe('getPendingTournamentApprovals', () => {
    it('should get tournaments pending approval', async () => {
      // Create organizer
      const [organizer] = await db.insert(usersTable).values({
        username: 'organizer1',
        email: 'organizer@test.com',
        password_hash: 'hash1',
        full_name: 'Tournament Organizer',
        role: 'tournament_organizer',
        is_active: true
      }).returning().execute();

      // Create tournaments with different statuses
      await db.insert(tournamentsTable).values([
        {
          organizer_id: organizer.id,
          name: 'Pending Tournament',
          bracket_type: 'single_elimination',
          entry_fee: '50.00',
          max_participants: 16,
          registration_start: new Date('2024-01-01'),
          registration_end: new Date('2024-01-15'),
          tournament_start: new Date('2024-01-20'),
          tournament_end: new Date('2024-01-25'),
          status: 'pending_approval'
        },
        {
          organizer_id: organizer.id,
          name: 'Published Tournament',
          bracket_type: 'single_elimination',
          entry_fee: '30.00',
          max_participants: 8,
          registration_start: new Date('2024-02-01'),
          registration_end: new Date('2024-02-15'),
          tournament_start: new Date('2024-02-20'),
          tournament_end: new Date('2024-02-25'),
          status: 'published'
        }
      ]).execute();

      const result = await getPendingTournamentApprovals();

      expect(result).toHaveLength(1);
      expect(result[0].name).toEqual('Pending Tournament');
      expect(result[0].status).toEqual('pending_approval');
      expect(typeof result[0].entry_fee).toEqual('number');
    });
  });

  describe('approveTournament', () => {
    it('should approve tournament successfully', async () => {
      // Create organizer
      const [organizer] = await db.insert(usersTable).values({
        username: 'organizer1',
        email: 'organizer@test.com',
        password_hash: 'hash1',
        full_name: 'Tournament Organizer',
        role: 'tournament_organizer',
        is_active: true
      }).returning().execute();

      const [tournament] = await db.insert(tournamentsTable).values({
        organizer_id: organizer.id,
        name: 'Test Tournament',
        bracket_type: 'single_elimination',
        entry_fee: '50.00',
        max_participants: 16,
        registration_start: new Date('2024-01-01'),
        registration_end: new Date('2024-01-15'),
        tournament_start: new Date('2024-01-20'),
        tournament_end: new Date('2024-01-25'),
        status: 'pending_approval'
      }).returning().execute();

      const result = await approveTournament(tournament.id, true);

      expect(result.id).toEqual(tournament.id);
      expect(result.status).toEqual('published');

      // Verify in database
      const [updatedTournament] = await db.select()
        .from(tournamentsTable)
        .where(eq(tournamentsTable.id, tournament.id))
        .execute();

      expect(updatedTournament.status).toEqual('published');
    });

    it('should reject tournament by setting status to draft', async () => {
      // Create organizer
      const [organizer] = await db.insert(usersTable).values({
        username: 'organizer1',
        email: 'organizer@test.com',
        password_hash: 'hash1',
        full_name: 'Tournament Organizer',
        role: 'tournament_organizer',
        is_active: true
      }).returning().execute();

      const [tournament] = await db.insert(tournamentsTable).values({
        organizer_id: organizer.id,
        name: 'Test Tournament',
        bracket_type: 'single_elimination',
        entry_fee: '50.00',
        max_participants: 16,
        registration_start: new Date('2024-01-01'),
        registration_end: new Date('2024-01-15'),
        tournament_start: new Date('2024-01-20'),
        tournament_end: new Date('2024-01-25'),
        status: 'pending_approval'
      }).returning().execute();

      const result = await approveTournament(tournament.id, false);

      expect(result.id).toEqual(tournament.id);
      expect(result.status).toEqual('draft');
    });

    it('should throw error for non-existent tournament', async () => {
      await expect(approveTournament(999, true)).rejects.toThrow('Tournament not found');
    });
  });

  describe('getPlatformStatistics', () => {
    it('should return comprehensive platform statistics', async () => {
      // Create test data
      const [owner] = await db.insert(usersTable).values({
        username: 'owner1',
        email: 'owner@test.com',
        password_hash: 'hash1',
        full_name: 'Facility Owner',
        role: 'facility_owner',
        is_active: true
      }).returning().execute();

      const [player] = await db.insert(usersTable).values({
        username: 'player1',
        email: 'player@test.com',
        password_hash: 'hash2',
        full_name: 'Player',
        role: 'player',
        is_active: false
      }).returning().execute();

      const [facility] = await db.insert(facilitiesTable).values({
        owner_id: owner.id,
        name: 'Test Facility',
        address: '123 Test St',
        city: 'Test City',
        amenities: []
      }).returning().execute();

      const [pitch] = await db.insert(pitchesTable).values({
        facility_id: facility.id,
        name: 'Test Pitch',
        type: 'football_11',
        hourly_rate: '50.00'
      }).returning().execute();

      await db.insert(bookingsTable).values({
        player_id: player.id,
        pitch_id: pitch.id,
        facility_id: facility.id,
        booking_date: '2024-01-15',
        start_time: '10:00',
        end_time: '11:00',
        total_amount: '50.00',
        status: 'confirmed'
      }).execute();

      await db.insert(tournamentsTable).values({
        organizer_id: owner.id,
        name: 'Test Tournament',
        bracket_type: 'single_elimination',
        entry_fee: '25.00',
        max_participants: 8,
        registration_start: new Date('2024-01-01'),
        registration_end: new Date('2024-01-15'),
        tournament_start: new Date('2024-01-20'),
        tournament_end: new Date('2024-01-25'),
        status: 'published'
      }).execute();

      const result = await getPlatformStatistics();

      expect(result.totalUsers).toEqual(2);
      expect(result.totalFacilities).toEqual(1);
      expect(result.totalBookings).toEqual(1);
      expect(result.totalTournaments).toEqual(1);
      expect(result.totalRevenue).toEqual(50);
      expect(result.activeUsers).toEqual(1);
      expect(typeof result.monthlyRevenue).toEqual('number');
    });
  });

  describe('getFinancialSettlements', () => {
    it('should calculate financial settlements for facility owners', async () => {
      // Create facility owner
      const [owner] = await db.insert(usersTable).values({
        username: 'owner1',
        email: 'owner@test.com',
        password_hash: 'hash1',
        full_name: 'Facility Owner',
        role: 'facility_owner',
        is_active: true
      }).returning().execute();

      // Create wallet with positive balance
      await db.insert(walletsTable).values({
        user_id: owner.id,
        balance: '150.00',
        max_negative_balance: '100.00'
      }).execute();

      const result = await getFinancialSettlements();

      expect(result).toHaveLength(1);
      expect(result[0].facilityOwnerId).toEqual(owner.id);
      expect(result[0].ownerName).toEqual('Facility Owner');
      expect(result[0].balance).toEqual(150);
      expect(result[0].settlementAmount).toEqual(150);
      expect(result[0].settlementType).toEqual('payout');
    });

    it('should identify owners needing collection for exceeded negative balance', async () => {
      // Create facility owner
      const [owner] = await db.insert(usersTable).values({
        username: 'owner1',
        email: 'owner@test.com',
        password_hash: 'hash1',
        full_name: 'Facility Owner',
        role: 'facility_owner',
        is_active: true
      }).returning().execute();

      // Create wallet with negative balance exceeding limit
      await db.insert(walletsTable).values({
        user_id: owner.id,
        balance: '-150.00',
        max_negative_balance: '100.00'
      }).execute();

      const result = await getFinancialSettlements();

      expect(result).toHaveLength(1);
      expect(result[0].balance).toEqual(-150);
      expect(result[0].settlementAmount).toEqual(50); // Exceeded by 50
      expect(result[0].settlementType).toEqual('collection');
    });
  });

  describe('setMaxNegativeBalance', () => {
    it('should update max negative balance successfully', async () => {
      // Create user and wallet
      const [user] = await db.insert(usersTable).values({
        username: 'owner1',
        email: 'owner@test.com',
        password_hash: 'hash1',
        full_name: 'Facility Owner',
        role: 'facility_owner',
        is_active: true
      }).returning().execute();

      await db.insert(walletsTable).values({
        user_id: user.id,
        balance: '0.00',
        max_negative_balance: '50.00'
      }).execute();

      const result = await setMaxNegativeBalance(user.id, 200);

      expect(result.user_id).toEqual(user.id);
      expect(result.max_negative_balance).toEqual(200);

      // Verify in database
      const [wallet] = await db.select()
        .from(walletsTable)
        .where(eq(walletsTable.user_id, user.id))
        .execute();

      expect(parseFloat(wallet.max_negative_balance)).toEqual(200);
    });

    it('should throw error for non-existent wallet', async () => {
      await expect(setMaxNegativeBalance(999, 100)).rejects.toThrow('Wallet not found');
    });
  });

  describe('adjustWalletBalance', () => {
    it('should adjust wallet balance and create transaction record', async () => {
      // Create user and wallet
      const [user] = await db.insert(usersTable).values({
        username: 'owner1',
        email: 'owner@test.com',
        password_hash: 'hash1',
        full_name: 'Facility Owner',
        role: 'facility_owner',
        is_active: true
      }).returning().execute();

      const [wallet] = await db.insert(walletsTable).values({
        user_id: user.id,
        balance: '100.00',
        max_negative_balance: '50.00'
      }).returning().execute();

      await adjustWalletBalance(user.id, 50, 'Admin bonus adjustment');

      // Verify wallet balance updated
      const [updatedWallet] = await db.select()
        .from(walletsTable)
        .where(eq(walletsTable.user_id, user.id))
        .execute();

      expect(parseFloat(updatedWallet.balance)).toEqual(150);

      // Verify transaction created
      const transactions = await db.select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.wallet_id, wallet.id))
        .execute();

      expect(transactions).toHaveLength(1);
      expect(transactions[0].type).toEqual('admin_adjustment');
      expect(parseFloat(transactions[0].amount)).toEqual(50);
      expect(transactions[0].description).toEqual('Admin bonus adjustment');
    });

    it('should handle negative adjustments', async () => {
      // Create user and wallet
      const [user] = await db.insert(usersTable).values({
        username: 'owner1',
        email: 'owner@test.com',
        password_hash: 'hash1',
        full_name: 'Facility Owner',
        role: 'facility_owner',
        is_active: true
      }).returning().execute();

      await db.insert(walletsTable).values({
        user_id: user.id,
        balance: '100.00',
        max_negative_balance: '50.00'
      }).execute();

      await adjustWalletBalance(user.id, -30, 'Admin penalty adjustment');

      // Verify wallet balance updated
      const [updatedWallet] = await db.select()
        .from(walletsTable)
        .where(eq(walletsTable.user_id, user.id))
        .execute();

      expect(parseFloat(updatedWallet.balance)).toEqual(70);
    });

    it('should throw error for non-existent wallet', async () => {
      await expect(adjustWalletBalance(999, 50, 'Test')).rejects.toThrow('Wallet not found');
    });
  });

  describe('getTournamentOrganizerApplications', () => {
    it('should return empty array (no applications system in current schema)', async () => {
      const result = await getTournamentOrganizerApplications();
      expect(result).toEqual([]);
    });
  });
});