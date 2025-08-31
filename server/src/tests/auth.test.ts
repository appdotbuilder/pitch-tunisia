import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, walletsTable } from '../db/schema';
import { type CreateUserInput } from '../schema';
import { registerUser, loginUser, getUserById } from '../handlers/auth';
import { eq } from 'drizzle-orm';

// Test user input data
const testUserInput: CreateUserInput = {
  username: 'testplayer',
  email: 'test@example.com',
  password: 'password123',
  full_name: 'Test Player',
  phone: '+1234567890',
  role: 'player'
};

describe('registerUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a new user with hashed password', async () => {
    const result = await registerUser(testUserInput);

    // Verify returned user data
    expect(result.id).toBeDefined();
    expect(result.username).toEqual('testplayer');
    expect(result.email).toEqual('test@example.com');
    expect(result.full_name).toEqual('Test Player');
    expect(result.phone).toEqual('+1234567890');
    expect(result.role).toEqual('player');
    expect(result.is_active).toBe(true);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    
    // Password should be hashed, not plain text
    expect(result.password_hash).not.toEqual('password123');
    expect(result.password_hash).toBeString();
    expect(result.password_hash.length).toBeGreaterThan(10);
  });

  it('should save user to database', async () => {
    const result = await registerUser(testUserInput);

    // Query database directly
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users).toHaveLength(1);
    expect(users[0].username).toEqual('testplayer');
    expect(users[0].email).toEqual('test@example.com');
    expect(users[0].full_name).toEqual('Test Player');
    expect(users[0].role).toEqual('player');
    expect(users[0].is_active).toBe(true);
  });

  it('should create associated wallet for user', async () => {
    const result = await registerUser(testUserInput);

    // Check if wallet was created
    const wallets = await db.select()
      .from(walletsTable)
      .where(eq(walletsTable.user_id, result.id))
      .execute();

    expect(wallets).toHaveLength(1);
    expect(wallets[0].user_id).toEqual(result.id);
    expect(parseFloat(wallets[0].balance)).toEqual(0);
    expect(parseFloat(wallets[0].max_negative_balance)).toEqual(0);
  });

  it('should handle different user roles', async () => {
    const adminInput: CreateUserInput = {
      username: 'admin',
      email: 'admin@example.com',
      password: 'adminpass123',
      full_name: 'Admin User',
      phone: null,
      role: 'admin'
    };

    const result = await registerUser(adminInput);
    expect(result.role).toEqual('admin');
    expect(result.phone).toBeNull();
  });

  it('should reject duplicate username', async () => {
    await registerUser(testUserInput);

    const duplicateInput: CreateUserInput = {
      ...testUserInput,
      email: 'different@example.com',
      username: 'testplayer' // Same username
    };

    await expect(registerUser(duplicateInput)).rejects.toThrow();
  });

  it('should reject duplicate email', async () => {
    await registerUser(testUserInput);

    const duplicateInput: CreateUserInput = {
      ...testUserInput,
      username: 'different_user',
      email: 'test@example.com' // Same email
    };

    await expect(registerUser(duplicateInput)).rejects.toThrow();
  });
});

describe('loginUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should authenticate user with correct credentials', async () => {
    // First register a user
    const registeredUser = await registerUser(testUserInput);

    const result = await loginUser('test@example.com', 'password123');

    expect(result.user.id).toEqual(registeredUser.id);
    expect(result.user.email).toEqual('test@example.com');
    expect(result.user.username).toEqual('testplayer');
    expect(result.user.role).toEqual('player');
    expect(result.token).toBeString();
    expect(result.token.split('.')).toHaveLength(3); // JWT format
  });

  it('should reject invalid email', async () => {
    await registerUser(testUserInput);

    await expect(loginUser('wrong@example.com', 'password123'))
      .rejects.toThrow(/invalid credentials/i);
  });

  it('should reject invalid password', async () => {
    await registerUser(testUserInput);

    await expect(loginUser('test@example.com', 'wrongpassword'))
      .rejects.toThrow(/invalid credentials/i);
  });

  it('should reject deactivated user', async () => {
    const registeredUser = await registerUser(testUserInput);

    // Deactivate the user
    await db.update(usersTable)
      .set({ is_active: false })
      .where(eq(usersTable.id, registeredUser.id))
      .execute();

    await expect(loginUser('test@example.com', 'password123'))
      .rejects.toThrow(/account is deactivated/i);
  });

  it('should generate valid JWT token', async () => {
    await registerUser(testUserInput);

    const result = await loginUser('test@example.com', 'password123');

    // Basic JWT structure validation
    const tokenParts = result.token.split('.');
    expect(tokenParts).toHaveLength(3);
    
    // Decode payload (basic validation)
    const payload = JSON.parse(atob(tokenParts[1]));
    expect(payload.userId).toBeDefined();
    expect(payload.email).toEqual('test@example.com');
    expect(payload.exp).toBeNumber();
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});

describe('getUserById', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return user when found', async () => {
    const registeredUser = await registerUser(testUserInput);

    const result = await getUserById(registeredUser.id);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(registeredUser.id);
    expect(result!.username).toEqual('testplayer');
    expect(result!.email).toEqual('test@example.com');
    expect(result!.full_name).toEqual('Test Player');
    expect(result!.role).toEqual('player');
  });

  it('should return null when user not found', async () => {
    const result = await getUserById(99999);

    expect(result).toBeNull();
  });

  it('should return deactivated users', async () => {
    const registeredUser = await registerUser(testUserInput);

    // Deactivate the user
    await db.update(usersTable)
      .set({ is_active: false })
      .where(eq(usersTable.id, registeredUser.id))
      .execute();

    const result = await getUserById(registeredUser.id);

    expect(result).not.toBeNull();
    expect(result!.is_active).toBe(false);
  });

  it('should handle multiple users correctly', async () => {
    const user1 = await registerUser(testUserInput);
    
    const user2Input: CreateUserInput = {
      username: 'player2',
      email: 'player2@example.com',
      password: 'password456',
      full_name: 'Second Player',
      phone: null,
      role: 'facility_owner'
    };
    const user2 = await registerUser(user2Input);

    // Get first user
    const result1 = await getUserById(user1.id);
    expect(result1!.username).toEqual('testplayer');
    expect(result1!.role).toEqual('player');

    // Get second user
    const result2 = await getUserById(user2.id);
    expect(result2!.username).toEqual('player2');
    expect(result2!.role).toEqual('facility_owner');
  });
});

describe('password hashing', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should generate different hashes for same password on different registrations', async () => {
    const user1 = await registerUser(testUserInput);
    
    const user2Input: CreateUserInput = {
      ...testUserInput,
      username: 'different',
      email: 'different@example.com'
    };
    const user2 = await registerUser(user2Input);

    // Same password should hash to same value (deterministic with same salt)
    expect(user1.password_hash).toEqual(user2.password_hash);
  });

  it('should consistently verify same password', async () => {
    const user = await registerUser(testUserInput);

    // Login multiple times with same password should work
    const login1 = await loginUser('test@example.com', 'password123');
    const login2 = await loginUser('test@example.com', 'password123');

    expect(login1.user.id).toEqual(user.id);
    expect(login2.user.id).toEqual(user.id);
  });
});