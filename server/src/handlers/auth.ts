import { db } from '../db';
import { usersTable, walletsTable } from '../db/schema';
import { type CreateUserInput, type User } from '../schema';
import { eq } from 'drizzle-orm';

// Simple password hashing using built-in crypto
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'salt_key_sports_booking');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Simple JWT token generation
function generateJWT(userId: number, email: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { 
    userId, 
    email, 
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };
  
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = btoa(`${encodedHeader}.${encodedPayload}.secret_key`);
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function registerUser(input: CreateUserInput): Promise<User> {
  try {
    // Hash the password
    const passwordHash = await hashPassword(input.password);

    // Insert user record
    const userResult = await db.insert(usersTable)
      .values({
        username: input.username,
        email: input.email,
        password_hash: passwordHash,
        full_name: input.full_name,
        phone: input.phone,
        role: input.role
      })
      .returning()
      .execute();

    const user = userResult[0];

    // Create associated wallet for the user
    await db.insert(walletsTable)
      .values({
        user_id: user.id,
        balance: '0.00',
        max_negative_balance: '0.00'
      })
      .execute();

    return user;
  } catch (error) {
    console.error('User registration failed:', error);
    throw error;
  }
}

export async function loginUser(email: string, password: string): Promise<{ user: User; token: string }> {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .execute();

    if (users.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      throw new Error('Account is deactivated');
    }

    // Verify password
    const hashedPassword = await hashPassword(password);
    if (user.password_hash !== hashedPassword) {
      throw new Error('Invalid credentials');
    }

    // Generate JWT token
    const token = generateJWT(user.id, user.email);

    return {
      user,
      token
    };
  } catch (error) {
    console.error('User login failed:', error);
    throw error;
  }
}

export async function getUserById(userId: number): Promise<User | null> {
  try {
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    return users.length > 0 ? users[0] : null;
  } catch (error) {
    console.error('Get user by ID failed:', error);
    throw error;
  }
}