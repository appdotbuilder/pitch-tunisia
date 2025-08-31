import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, messagesTable, invitationsTable, facilitiesTable, pitchesTable } from '../db/schema';
import { type CreateMessageInput } from '../schema';
import { 
  sendMessage, 
  getConversation, 
  getUserConversations, 
  markMessagesAsRead,
  sendGameInvitation,
  getPendingInvitations,
  respondToInvitation
} from '../handlers/messaging';
import { eq, and, isNull } from 'drizzle-orm';

// Test data setup
const createTestUsers = async () => {
  const users = await db.insert(usersTable)
    .values([
      {
        username: 'alice',
        email: 'alice@example.com',
        password_hash: 'hash1',
        full_name: 'Alice Smith',
        role: 'player'
      },
      {
        username: 'bob',
        email: 'bob@example.com',
        password_hash: 'hash2',
        full_name: 'Bob Johnson',
        role: 'player'
      },
      {
        username: 'charlie',
        email: 'charlie@example.com',
        password_hash: 'hash3',
        full_name: 'Charlie Brown',
        role: 'facility_owner'
      }
    ])
    .returning()
    .execute();

  return {
    alice: users[0],
    bob: users[1],
    charlie: users[2]
  };
};

const createTestFacilityAndPitch = async (ownerId: number) => {
  const facility = await db.insert(facilitiesTable)
    .values({
      owner_id: ownerId,
      name: 'Test Sports Center',
      address: '123 Main St',
      city: 'Test City',
      amenities: ['parking', 'lockers']
    })
    .returning()
    .execute();

  const pitch = await db.insert(pitchesTable)
    .values({
      facility_id: facility[0].id,
      name: 'Main Pitch',
      type: 'football_7',
      hourly_rate: '50.00'
    })
    .returning()
    .execute();

  return { facility: facility[0], pitch: pitch[0] };
};

const testMessageInput: CreateMessageInput = {
  sender_id: 1,
  receiver_id: 2,
  type: 'text',
  content: 'Hello there!',
  metadata: null
};

describe('Messaging Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('sendMessage', () => {
    it('should send a text message successfully', async () => {
      const users = await createTestUsers();
      
      const messageInput: CreateMessageInput = {
        sender_id: users.alice.id,
        receiver_id: users.bob.id,
        type: 'text',
        content: 'Hey Bob, want to play football?',
        metadata: null
      };

      const result = await sendMessage(messageInput);

      expect(result.id).toBeDefined();
      expect(result.sender_id).toEqual(users.alice.id);
      expect(result.receiver_id).toEqual(users.bob.id);
      expect(result.type).toEqual('text');
      expect(result.content).toEqual('Hey Bob, want to play football?');
      expect(result.metadata).toBeNull();
      expect(result.read_at).toBeNull();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should send message with metadata', async () => {
      const users = await createTestUsers();
      
      const messageInput: CreateMessageInput = {
        sender_id: users.alice.id,
        receiver_id: users.bob.id,
        type: 'invitation',
        content: 'Team invitation',
        metadata: { team_id: 1, expires_at: '2024-12-31T23:59:59Z' }
      };

      const result = await sendMessage(messageInput);

      expect(result.metadata).toEqual({ team_id: 1, expires_at: '2024-12-31T23:59:59Z' });
    });

    it('should save message to database', async () => {
      const users = await createTestUsers();
      
      const messageInput: CreateMessageInput = {
        sender_id: users.alice.id,
        receiver_id: users.bob.id,
        type: 'text',
        content: 'Test message',
        metadata: null
      };

      const result = await sendMessage(messageInput);

      const savedMessage = await db.select()
        .from(messagesTable)
        .where(eq(messagesTable.id, result.id))
        .execute();

      expect(savedMessage).toHaveLength(1);
      expect(savedMessage[0].content).toEqual('Test message');
      expect(savedMessage[0].sender_id).toEqual(users.alice.id);
      expect(savedMessage[0].receiver_id).toEqual(users.bob.id);
    });

    it('should throw error for non-existent sender', async () => {
      const users = await createTestUsers();
      
      const messageInput: CreateMessageInput = {
        sender_id: 999,
        receiver_id: users.bob.id,
        type: 'text',
        content: 'Hello',
        metadata: null
      };

      await expect(sendMessage(messageInput)).rejects.toThrow(/sender not found/i);
    });

    it('should throw error for non-existent receiver', async () => {
      const users = await createTestUsers();
      
      const messageInput: CreateMessageInput = {
        sender_id: users.alice.id,
        receiver_id: 999,
        type: 'text',
        content: 'Hello',
        metadata: null
      };

      await expect(sendMessage(messageInput)).rejects.toThrow(/receiver not found/i);
    });
  });

  describe('getConversation', () => {
    it('should fetch messages between two users', async () => {
      const users = await createTestUsers();

      // Create conversation
      await sendMessage({
        sender_id: users.alice.id,
        receiver_id: users.bob.id,
        type: 'text',
        content: 'Hi Bob!',
        metadata: null
      });

      await sendMessage({
        sender_id: users.bob.id,
        receiver_id: users.alice.id,
        type: 'text',
        content: 'Hi Alice!',
        metadata: null
      });

      const conversation = await getConversation(users.alice.id, users.bob.id);

      expect(conversation).toHaveLength(2);
      expect(conversation[0].content).toEqual('Hi Bob!');
      expect(conversation[1].content).toEqual('Hi Alice!');
    });

    it('should return messages in chronological order', async () => {
      const users = await createTestUsers();

      await sendMessage({
        sender_id: users.alice.id,
        receiver_id: users.bob.id,
        type: 'text',
        content: 'First message',
        metadata: null
      });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      await sendMessage({
        sender_id: users.bob.id,
        receiver_id: users.alice.id,
        type: 'text',
        content: 'Second message',
        metadata: null
      });

      const conversation = await getConversation(users.alice.id, users.bob.id);

      expect(conversation[0].content).toEqual('First message');
      expect(conversation[1].content).toEqual('Second message');
      expect(conversation[0].created_at.getTime()).toBeLessThan(conversation[1].created_at.getTime());
    });

    it('should respect limit parameter', async () => {
      const users = await createTestUsers();

      // Create 5 messages
      for (let i = 1; i <= 5; i++) {
        await sendMessage({
          sender_id: users.alice.id,
          receiver_id: users.bob.id,
          type: 'text',
          content: `Message ${i}`,
          metadata: null
        });
      }

      const conversation = await getConversation(users.alice.id, users.bob.id, 3);

      expect(conversation).toHaveLength(3);
      // Should get the 3 most recent messages
      expect(conversation[0].content).toEqual('Message 3');
      expect(conversation[1].content).toEqual('Message 4');
      expect(conversation[2].content).toEqual('Message 5');
    });

    it('should not include messages from other conversations', async () => {
      const users = await createTestUsers();

      // Alice to Bob
      await sendMessage({
        sender_id: users.alice.id,
        receiver_id: users.bob.id,
        type: 'text',
        content: 'Alice to Bob',
        metadata: null
      });

      // Alice to Charlie (different conversation)
      await sendMessage({
        sender_id: users.alice.id,
        receiver_id: users.charlie.id,
        type: 'text',
        content: 'Alice to Charlie',
        metadata: null
      });

      const conversation = await getConversation(users.alice.id, users.bob.id);

      expect(conversation).toHaveLength(1);
      expect(conversation[0].content).toEqual('Alice to Bob');
    });
  });

  describe('markMessagesAsRead', () => {
    it('should mark unread messages as read', async () => {
      const users = await createTestUsers();

      // Bob sends message to Alice
      const message = await sendMessage({
        sender_id: users.bob.id,
        receiver_id: users.alice.id,
        type: 'text',
        content: 'Unread message',
        metadata: null
      });

      // Verify message is unread
      expect(message.read_at).toBeNull();

      // Alice marks messages as read
      await markMessagesAsRead(users.alice.id, users.bob.id);

      // Check if message is now marked as read
      const updatedMessage = await db.select()
        .from(messagesTable)
        .where(eq(messagesTable.id, message.id))
        .execute();

      expect(updatedMessage[0].read_at).not.toBeNull();
      expect(updatedMessage[0].read_at).toBeInstanceOf(Date);
    });

    it('should only mark messages from specific sender', async () => {
      const users = await createTestUsers();

      // Bob sends message to Alice
      const bobMessage = await sendMessage({
        sender_id: users.bob.id,
        receiver_id: users.alice.id,
        type: 'text',
        content: 'From Bob',
        metadata: null
      });

      // Charlie sends message to Alice
      const charlieMessage = await sendMessage({
        sender_id: users.charlie.id,
        receiver_id: users.alice.id,
        type: 'text',
        content: 'From Charlie',
        metadata: null
      });

      // Alice marks only Bob's messages as read
      await markMessagesAsRead(users.alice.id, users.bob.id);

      const messages = await db.select()
        .from(messagesTable)
        .where(eq(messagesTable.receiver_id, users.alice.id))
        .execute();

      const bobMsg = messages.find(m => m.id === bobMessage.id);
      const charlieMsg = messages.find(m => m.id === charlieMessage.id);

      expect(bobMsg?.read_at).not.toBeNull();
      expect(charlieMsg?.read_at).toBeNull();
    });

    it('should not affect messages Alice sent to Bob', async () => {
      const users = await createTestUsers();

      // Alice sends message to Bob (shouldn't be marked as read by Alice)
      const aliceMessage = await sendMessage({
        sender_id: users.alice.id,
        receiver_id: users.bob.id,
        type: 'text',
        content: 'From Alice to Bob',
        metadata: null
      });

      await markMessagesAsRead(users.alice.id, users.bob.id);

      const message = await db.select()
        .from(messagesTable)
        .where(eq(messagesTable.id, aliceMessage.id))
        .execute();

      expect(message[0].read_at).toBeNull();
    });
  });

  describe('sendGameInvitation', () => {
    it('should send game invitation message', async () => {
      const users = await createTestUsers();
      const { pitch } = await createTestFacilityAndPitch(users.charlie.id);
      const proposedTime = new Date('2024-06-15T14:00:00Z');

      const result = await sendGameInvitation(
        users.alice.id,
        users.bob.id,
        pitch.id,
        proposedTime,
        'Want to play football?'
      );

      expect(result.sender_id).toEqual(users.alice.id);
      expect(result.receiver_id).toEqual(users.bob.id);
      expect(result.type).toEqual('invitation');
      expect(result.content).toEqual('Want to play football?');
      expect(result.metadata).toEqual({
        pitch_id: pitch.id,
        proposed_time: proposedTime.toISOString(),
        invitation_type: 'game'
      });
    });

    it('should use default message when none provided', async () => {
      const users = await createTestUsers();
      const { pitch } = await createTestFacilityAndPitch(users.charlie.id);
      const proposedTime = new Date('2024-06-15T14:00:00Z');

      const result = await sendGameInvitation(
        users.alice.id,
        users.bob.id,
        pitch.id,
        proposedTime
      );

      expect(result.content).toEqual('Game invitation');
    });
  });

  describe('getPendingInvitations', () => {
    it('should fetch pending invitations for user', async () => {
      const users = await createTestUsers();

      // Create invitation
      await db.insert(invitationsTable)
        .values({
          sender_id: users.alice.id,
          receiver_id: users.bob.id,
          type: 'team_join',
          status: 'pending',
          message: 'Join our team!'
        })
        .execute();

      const invitations = await getPendingInvitations(users.bob.id);

      expect(invitations).toHaveLength(1);
      expect(invitations[0].sender_id).toEqual(users.alice.id);
      expect(invitations[0].receiver_id).toEqual(users.bob.id);
      expect(invitations[0].status).toEqual('pending');
      expect(invitations[0].message).toEqual('Join our team!');
    });

    it('should not return accepted or rejected invitations', async () => {
      const users = await createTestUsers();

      await db.insert(invitationsTable)
        .values([
          {
            sender_id: users.alice.id,
            receiver_id: users.bob.id,
            type: 'team_join',
            status: 'pending',
            message: 'Pending invitation'
          },
          {
            sender_id: users.charlie.id,
            receiver_id: users.bob.id,
            type: 'team_join',
            status: 'accepted',
            message: 'Accepted invitation'
          },
          {
            sender_id: users.alice.id,
            receiver_id: users.bob.id,
            type: 'game_invite',
            status: 'rejected',
            message: 'Rejected invitation'
          }
        ])
        .execute();

      const invitations = await getPendingInvitations(users.bob.id);

      expect(invitations).toHaveLength(1);
      expect(invitations[0].message).toEqual('Pending invitation');
    });

    it('should not return invitations for other users', async () => {
      const users = await createTestUsers();

      await db.insert(invitationsTable)
        .values([
          {
            sender_id: users.alice.id,
            receiver_id: users.bob.id,
            type: 'team_join',
            status: 'pending',
            message: 'For Bob'
          },
          {
            sender_id: users.alice.id,
            receiver_id: users.charlie.id,
            type: 'team_join',
            status: 'pending',
            message: 'For Charlie'
          }
        ])
        .execute();

      const invitations = await getPendingInvitations(users.bob.id);

      expect(invitations).toHaveLength(1);
      expect(invitations[0].message).toEqual('For Bob');
    });
  });

  describe('respondToInvitation', () => {
    it('should accept invitation successfully', async () => {
      const users = await createTestUsers();

      const invitation = await db.insert(invitationsTable)
        .values({
          sender_id: users.alice.id,
          receiver_id: users.bob.id,
          type: 'team_join',
          status: 'pending',
          message: 'Join our team!'
        })
        .returning()
        .execute();

      const result = await respondToInvitation(invitation[0].id, users.bob.id, true);

      expect(result.status).toEqual('accepted');
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should reject invitation successfully', async () => {
      const users = await createTestUsers();

      const invitation = await db.insert(invitationsTable)
        .values({
          sender_id: users.alice.id,
          receiver_id: users.bob.id,
          type: 'game_invite',
          status: 'pending',
          message: 'Game invitation'
        })
        .returning()
        .execute();

      const result = await respondToInvitation(invitation[0].id, users.bob.id, false);

      expect(result.status).toEqual('rejected');
    });

    it('should throw error for non-existent invitation', async () => {
      const users = await createTestUsers();

      await expect(respondToInvitation(999, users.bob.id, true))
        .rejects.toThrow(/invitation not found/i);
    });

    it('should throw error when responding to others invitation', async () => {
      const users = await createTestUsers();

      const invitation = await db.insert(invitationsTable)
        .values({
          sender_id: users.alice.id,
          receiver_id: users.bob.id,
          type: 'team_join',
          status: 'pending'
        })
        .returning()
        .execute();

      await expect(respondToInvitation(invitation[0].id, users.charlie.id, true))
        .rejects.toThrow(/invitation not found/i);
    });

    it('should throw error for already processed invitation', async () => {
      const users = await createTestUsers();

      const invitation = await db.insert(invitationsTable)
        .values({
          sender_id: users.alice.id,
          receiver_id: users.bob.id,
          type: 'team_join',
          status: 'accepted'
        })
        .returning()
        .execute();

      await expect(respondToInvitation(invitation[0].id, users.bob.id, false))
        .rejects.toThrow(/invitation not found/i);
    });
  });

  describe('getUserConversations', () => {
    it('should return conversations with last message and unread count', async () => {
      const users = await createTestUsers();

      // Alice sends unread message to Bob
      await sendMessage({
        sender_id: users.alice.id,
        receiver_id: users.bob.id,
        type: 'text',
        content: 'Hello Bob!',
        metadata: null
      });

      // Charlie sends message to Bob
      await sendMessage({
        sender_id: users.charlie.id,
        receiver_id: users.bob.id,
        type: 'text',
        content: 'Hi Bob from Charlie!',
        metadata: null
      });

      const conversations = await getUserConversations(users.bob.id);

      expect(conversations).toHaveLength(2);
      
      const aliceConversation = conversations.find(c => c.userId === users.alice.id);
      const charlieConversation = conversations.find(c => c.userId === users.charlie.id);

      expect(aliceConversation).toBeDefined();
      expect(aliceConversation?.username).toEqual('alice');
      expect(aliceConversation?.lastMessage.content).toEqual('Hello Bob!');
      expect(aliceConversation?.unreadCount).toEqual(1);

      expect(charlieConversation).toBeDefined();
      expect(charlieConversation?.username).toEqual('charlie');
      expect(charlieConversation?.lastMessage.content).toEqual('Hi Bob from Charlie!');
      expect(charlieConversation?.unreadCount).toEqual(1);
    });

    it('should show zero unread count for read messages', async () => {
      const users = await createTestUsers();

      // Alice sends message to Bob
      await sendMessage({
        sender_id: users.alice.id,
        receiver_id: users.bob.id,
        type: 'text',
        content: 'Read message',
        metadata: null
      });

      // Bob marks message as read
      await markMessagesAsRead(users.bob.id, users.alice.id);

      const conversations = await getUserConversations(users.bob.id);

      expect(conversations).toHaveLength(1);
      expect(conversations[0].unreadCount).toEqual(0);
    });

    it('should return empty array when user has no conversations', async () => {
      const users = await createTestUsers();

      const conversations = await getUserConversations(users.bob.id);

      expect(conversations).toHaveLength(0);
    });
  });
});