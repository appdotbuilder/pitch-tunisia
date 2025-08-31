import { db } from '../db';
import { messagesTable, invitationsTable, usersTable } from '../db/schema';
import { type CreateMessageInput, type Message, type Invitation } from '../schema';
import { eq, and, or, desc, isNull, sql } from 'drizzle-orm';

export async function sendMessage(input: CreateMessageInput): Promise<Message> {
  try {
    // Verify both users exist
    const [sender, receiver] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.id, input.sender_id)).execute(),
      db.select().from(usersTable).where(eq(usersTable.id, input.receiver_id)).execute()
    ]);

    if (sender.length === 0) {
      throw new Error('Sender not found');
    }
    if (receiver.length === 0) {
      throw new Error('Receiver not found');
    }

    // Insert message
    const result = await db.insert(messagesTable)
      .values({
        sender_id: input.sender_id,
        receiver_id: input.receiver_id,
        type: input.type,
        content: input.content,
        metadata: input.metadata
      })
      .returning()
      .execute();

    return {
      ...result[0],
      metadata: result[0].metadata as Record<string, any> | null
    };
  } catch (error) {
    console.error('Message sending failed:', error);
    throw error;
  }
}

export async function getConversation(user1Id: number, user2Id: number, limit: number = 50): Promise<Message[]> {
  try {
    const messages = await db.select()
      .from(messagesTable)
      .where(
        or(
          and(
            eq(messagesTable.sender_id, user1Id),
            eq(messagesTable.receiver_id, user2Id)
          ),
          and(
            eq(messagesTable.sender_id, user2Id),
            eq(messagesTable.receiver_id, user1Id)
          )
        )
      )
      .orderBy(desc(messagesTable.created_at))
      .limit(limit)
      .execute();

    // Return in chronological order (oldest first) and fix metadata types
    return messages.reverse().map(message => ({
      ...message,
      metadata: message.metadata as Record<string, any> | null
    }));
  } catch (error) {
    console.error('Failed to fetch conversation:', error);
    throw error;
  }
}

export async function getUserConversations(userId: number): Promise<{
  userId: number;
  username: string;
  lastMessage: Message;
  unreadCount: number;
}[]> {
  try {
    // Get all users who have conversations with the current user
    const conversationUsers = await db.select({
      userId: sql<number>`CASE 
        WHEN ${messagesTable.sender_id} = ${userId} THEN ${messagesTable.receiver_id}
        ELSE ${messagesTable.sender_id}
      END`.as('user_id'),
      username: usersTable.username,
      messageId: messagesTable.id,
      senderId: messagesTable.sender_id,
      receiverId: messagesTable.receiver_id,
      type: messagesTable.type,
      content: messagesTable.content,
      metadata: messagesTable.metadata,
      readAt: messagesTable.read_at,
      createdAt: messagesTable.created_at
    })
    .from(messagesTable)
    .innerJoin(usersTable, 
      sql`${usersTable.id} = CASE 
        WHEN ${messagesTable.sender_id} = ${userId} THEN ${messagesTable.receiver_id}
        ELSE ${messagesTable.sender_id}
      END`
    )
    .where(
      or(
        eq(messagesTable.sender_id, userId),
        eq(messagesTable.receiver_id, userId)
      )
    )
    .orderBy(desc(messagesTable.created_at))
    .execute();

    // Group by conversation partner and get latest message + unread count
    const conversationsMap = new Map<number, {
      userId: number;
      username: string;
      lastMessage: Message;
      unreadCount: number;
    }>();

    for (const row of conversationUsers) {
      const conversationUserId = row.userId;
      
      if (!conversationsMap.has(conversationUserId)) {
        // Count unread messages for this conversation
        const unreadCount = await db.select({
          count: sql<number>`count(*)`
        })
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.sender_id, conversationUserId),
            eq(messagesTable.receiver_id, userId),
            isNull(messagesTable.read_at)
          )
        )
        .execute();

        conversationsMap.set(conversationUserId, {
          userId: conversationUserId,
          username: row.username,
          lastMessage: {
            id: row.messageId,
            sender_id: row.senderId,
            receiver_id: row.receiverId,
            type: row.type,
            content: row.content,
            metadata: row.metadata as Record<string, any> | null,
            read_at: row.readAt,
            created_at: row.createdAt
          },
          unreadCount: Number(unreadCount[0]?.count || 0)
        });
      }
    }

    return Array.from(conversationsMap.values());
  } catch (error) {
    console.error('Failed to fetch user conversations:', error);
    throw error;
  }
}

export async function markMessagesAsRead(userId: number, otherUserId: number): Promise<void> {
  try {
    await db.update(messagesTable)
      .set({ 
        read_at: sql`NOW()` 
      })
      .where(
        and(
          eq(messagesTable.sender_id, otherUserId),
          eq(messagesTable.receiver_id, userId),
          isNull(messagesTable.read_at)
        )
      )
      .execute();
  } catch (error) {
    console.error('Failed to mark messages as read:', error);
    throw error;
  }
}

export async function sendGameInvitation(
  senderId: number,
  receiverId: number,
  pitchId: number,
  proposedTime: Date,
  message?: string
): Promise<Message> {
  try {
    // Send as a special invitation message
    const invitationMessage = await sendMessage({
      sender_id: senderId,
      receiver_id: receiverId,
      type: 'invitation',
      content: message || 'Game invitation',
      metadata: {
        pitch_id: pitchId,
        proposed_time: proposedTime.toISOString(),
        invitation_type: 'game'
      }
    });

    return invitationMessage;
  } catch (error) {
    console.error('Failed to send game invitation:', error);
    throw error;
  }
}

export async function getPendingInvitations(userId: number): Promise<Invitation[]> {
  try {
    const invitations = await db.select()
      .from(invitationsTable)
      .where(
        and(
          eq(invitationsTable.receiver_id, userId),
          eq(invitationsTable.status, 'pending')
        )
      )
      .orderBy(desc(invitationsTable.created_at))
      .execute();

    return invitations.map(invitation => ({
      ...invitation,
      type: invitation.type as 'team_join' | 'game_invite'
    }));
  } catch (error) {
    console.error('Failed to fetch pending invitations:', error);
    throw error;
  }
}

export async function respondToInvitation(
  invitationId: number,
  userId: number,
  accept: boolean
): Promise<Invitation> {
  try {
    // Verify invitation exists and belongs to user
    const existingInvitation = await db.select()
      .from(invitationsTable)
      .where(
        and(
          eq(invitationsTable.id, invitationId),
          eq(invitationsTable.receiver_id, userId),
          eq(invitationsTable.status, 'pending')
        )
      )
      .execute();

    if (existingInvitation.length === 0) {
      throw new Error('Invitation not found or already processed');
    }

    // Update invitation status
    const newStatus = accept ? 'accepted' : 'rejected';
    const result = await db.update(invitationsTable)
      .set({ 
        status: newStatus,
        updated_at: sql`NOW()`
      })
      .where(eq(invitationsTable.id, invitationId))
      .returning()
      .execute();

    return {
      ...result[0],
      type: result[0].type as 'team_join' | 'game_invite'
    };
  } catch (error) {
    console.error('Failed to respond to invitation:', error);
    throw error;
  }
}