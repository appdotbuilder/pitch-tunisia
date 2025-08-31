import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, walletsTable, walletTransactionsTable, facilitiesTable } from '../db/schema';
import { 
  getWalletByUserId, 
  topUpWallet, 
  debitWallet, 
  creditWallet, 
  getWalletTransactions, 
  checkWalletBalance,
  getFacilityWalletSummary
} from '../handlers/wallet';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  username: 'testplayer',
  email: 'testplayer@example.com',
  password_hash: 'hashedpassword',
  full_name: 'Test Player',
  phone: '+21612345678',
  role: 'player' as const
};

const testFacilityOwner = {
  username: 'facilityowner',
  email: 'owner@example.com',
  password_hash: 'hashedpassword',
  full_name: 'Facility Owner',
  phone: '+21612345679',
  role: 'facility_owner' as const
};

describe('Wallet Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getWalletByUserId', () => {
    it('should return null when user has no wallet', async () => {
      // Create user without wallet
      const users = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      const result = await getWalletByUserId(users[0].id);
      expect(result).toBeNull();
    });

    it('should return wallet when user has wallet', async () => {
      // Create user and wallet
      const users = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      await db.insert(walletsTable)
        .values({
          user_id: users[0].id,
          balance: '100.50',
          max_negative_balance: '50.00'
        })
        .execute();

      const result = await getWalletByUserId(users[0].id);

      expect(result).toBeDefined();
      expect(result!.user_id).toEqual(users[0].id);
      expect(typeof result!.balance).toBe('number');
      expect(result!.balance).toEqual(100.50);
      expect(typeof result!.max_negative_balance).toBe('number');
      expect(result!.max_negative_balance).toEqual(50.00);
    });
  });

  describe('topUpWallet', () => {
    it('should create wallet and add transaction for new user', async () => {
      // Create user
      const users = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      const result = await topUpWallet(users[0].id, 100.00, 'flouci', 'REF123');

      // Check transaction
      expect(result.type).toEqual('topup');
      expect(typeof result.amount).toBe('number');
      expect(result.amount).toEqual(100.00);
      expect(result.payment_method).toEqual('flouci');
      expect(result.reference_id).toEqual('REF123');
      expect(result.description).toContain('flouci');

      // Check wallet was created and balance updated
      const wallet = await getWalletByUserId(users[0].id);
      expect(wallet).toBeDefined();
      expect(wallet!.balance).toEqual(100.00);
    });

    it('should add to existing wallet balance', async () => {
      // Create user and wallet
      const users = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      await db.insert(walletsTable)
        .values({
          user_id: users[0].id,
          balance: '50.00',
          max_negative_balance: '0'
        })
        .execute();

      await topUpWallet(users[0].id, 75.25, 'edinar');

      // Check updated balance
      const wallet = await getWalletByUserId(users[0].id);
      expect(wallet!.balance).toEqual(125.25);
    });
  });

  describe('debitWallet', () => {
    it('should debit wallet when sufficient balance', async () => {
      // Create user and wallet
      const users = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      await db.insert(walletsTable)
        .values({
          user_id: users[0].id,
          balance: '100.00',
          max_negative_balance: '0'
        })
        .execute();

      const result = await debitWallet(users[0].id, 30.00, 'booking_payment', 'Test booking', 'BOOK123');

      // Check transaction
      expect(result.type).toEqual('booking_payment');
      expect(typeof result.amount).toBe('number');
      expect(result.amount).toEqual(-30.00); // Negative for debit
      expect(result.reference_id).toEqual('BOOK123');
      expect(result.description).toEqual('Test booking');

      // Check wallet balance updated
      const wallet = await getWalletByUserId(users[0].id);
      expect(wallet!.balance).toEqual(70.00);
    });

    it('should throw error when insufficient balance', async () => {
      // Create user and wallet with low balance
      const users = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      await db.insert(walletsTable)
        .values({
          user_id: users[0].id,
          balance: '10.00',
          max_negative_balance: '0'
        })
        .execute();

      expect(debitWallet(users[0].id, 50.00, 'tournament_fee'))
        .rejects.toThrow(/insufficient/i);
    });

    it('should throw error when wallet not found', async () => {
      // Create user without wallet
      const users = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      expect(debitWallet(users[0].id, 10.00, 'booking_payment'))
        .rejects.toThrow(/wallet not found/i);
    });
  });

  describe('creditWallet', () => {
    it('should create wallet and credit amount for new user', async () => {
      // Create user
      const users = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      const result = await creditWallet(users[0].id, 200.00, 'admin_adjustment', 'Bonus credit');

      // Check transaction
      expect(result.type).toEqual('admin_adjustment');
      expect(typeof result.amount).toBe('number');
      expect(result.amount).toEqual(200.00);
      expect(result.description).toEqual('Bonus credit');

      // Check wallet created and credited
      const wallet = await getWalletByUserId(users[0].id);
      expect(wallet!.balance).toEqual(200.00);
    });

    it('should add to existing wallet balance', async () => {
      // Create user and wallet
      const users = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      await db.insert(walletsTable)
        .values({
          user_id: users[0].id,
          balance: '50.00',
          max_negative_balance: '0'
        })
        .execute();

      await creditWallet(users[0].id, 150.00, 'facility_payout');

      // Check updated balance
      const wallet = await getWalletByUserId(users[0].id);
      expect(wallet!.balance).toEqual(200.00);
    });
  });

  describe('getWalletTransactions', () => {
    it('should return empty array when no wallet exists', async () => {
      // Create user without wallet
      const users = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      const result = await getWalletTransactions(users[0].id);
      expect(result).toEqual([]);
    });

    it('should return transactions in descending order', async () => {
      // Create user and wallet
      const users = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      const wallets = await db.insert(walletsTable)
        .values({
          user_id: users[0].id,
          balance: '100.00',
          max_negative_balance: '0'
        })
        .returning()
        .execute();

      // Create multiple transactions
      await topUpWallet(users[0].id, 50.00, 'flouci');
      await topUpWallet(users[0].id, 25.00, 'edinar');
      await debitWallet(users[0].id, 10.00, 'booking_payment');

      const result = await getWalletTransactions(users[0].id);

      expect(result).toHaveLength(3);
      expect(result[0].type).toEqual('booking_payment'); // Most recent first
      expect(result[0].amount).toEqual(-10.00);
      expect(result[1].type).toEqual('topup');
      expect(result[1].amount).toEqual(25.00);
      expect(result[2].type).toEqual('topup');
      expect(result[2].amount).toEqual(50.00);

      // Check numeric conversions
      result.forEach(transaction => {
        expect(typeof transaction.amount).toBe('number');
      });
    });

    it('should respect limit parameter', async () => {
      // Create user and wallet
      const users = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      await db.insert(walletsTable)
        .values({
          user_id: users[0].id,
          balance: '0',
          max_negative_balance: '0'
        })
        .execute();

      // Create 5 transactions
      for (let i = 0; i < 5; i++) {
        await topUpWallet(users[0].id, 10.00, 'flouci');
      }

      const result = await getWalletTransactions(users[0].id, 3);
      expect(result).toHaveLength(3);
    });
  });

  describe('checkWalletBalance', () => {
    it('should return false when no wallet exists', async () => {
      // Create user without wallet
      const users = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      const result = await checkWalletBalance(users[0].id, 10.00);
      expect(result).toBeFalse();
    });

    it('should return true when sufficient balance available', async () => {
      // Create user and wallet
      const users = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      await db.insert(walletsTable)
        .values({
          user_id: users[0].id,
          balance: '100.00',
          max_negative_balance: '50.00'
        })
        .execute();

      // Should work for amounts within balance + negative limit
      expect(await checkWalletBalance(users[0].id, 50.00)).toBeTrue();
      expect(await checkWalletBalance(users[0].id, 150.00)).toBeTrue(); // 100 + 50
    });

    it('should return false when insufficient balance', async () => {
      // Create user and wallet
      const users = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      await db.insert(walletsTable)
        .values({
          user_id: users[0].id,
          balance: '100.00',
          max_negative_balance: '25.00'
        })
        .execute();

      // Should fail for amounts exceeding balance + negative limit
      const result = await checkWalletBalance(users[0].id, 200.00); // > 100 + 25
      expect(result).toBeFalse();
    });
  });

  describe('getFacilityWalletSummary', () => {
    it('should return empty array when no facility owners', async () => {
      // Create regular player
      await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      const result = await getFacilityWalletSummary();
      expect(result).toEqual([]);
    });

    it('should return facility owner wallet summary', async () => {
      // Create facility owner
      const owners = await db.insert(usersTable)
        .values(testFacilityOwner)
        .returning()
        .execute();

      // Create wallet for owner
      const wallets = await db.insert(walletsTable)
        .values({
          user_id: owners[0].id,
          balance: '500.00',
          max_negative_balance: '0'
        })
        .returning()
        .execute();

      // Create facility
      await db.insert(facilitiesTable)
        .values({
          owner_id: owners[0].id,
          name: 'Test Facility',
          address: '123 Test Street',
          city: 'Tunis',
          amenities: ['parking', 'wifi']
        })
        .execute();

      // Create some booking payment transactions
      await db.insert(walletTransactionsTable)
        .values([
          {
            wallet_id: wallets[0].id,
            type: 'booking_payment',
            amount: '-100.00',
            description: 'Booking payment'
          },
          {
            wallet_id: wallets[0].id,
            type: 'booking_payment',
            amount: '-50.00',
            description: 'Another booking'
          }
        ])
        .execute();

      const result = await getFacilityWalletSummary();

      expect(result).toHaveLength(1);
      expect(result[0].userId).toEqual(owners[0].id);
      expect(typeof result[0].balance).toBe('number');
      expect(result[0].balance).toEqual(500.00);
      expect(typeof result[0].owedAmount).toBe('number');
      expect(result[0].owedAmount).toEqual(127.5); // 85% of 150 booking payments
    });
  });
});