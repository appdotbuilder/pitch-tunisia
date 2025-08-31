import { db } from '../db';
import { 
    teamsTable, 
    teamMembersTable, 
    invitationsTable,
    usersTable
} from '../db/schema';
import { 
    type Team, 
    type TeamMember, 
    type SearchTeamsInput,
    type Invitation
} from '../schema';
import { eq, and, or, ilike, SQL } from 'drizzle-orm';

export async function createTeam(
    captainId: number,
    name: string,
    description: string | null,
    maxPlayers: number,
    location: string | null,
    preferredTime: string | null
): Promise<Team> {
    try {
        // Verify captain exists and is a player
        const captain = await db.select()
            .from(usersTable)
            .where(and(
                eq(usersTable.id, captainId),
                eq(usersTable.role, 'player'),
                eq(usersTable.is_active, true)
            ))
            .execute();

        if (captain.length === 0) {
            throw new Error('Captain must be an active player');
        }

        // Create the team
        const result = await db.insert(teamsTable)
            .values({
                captain_id: captainId,
                name,
                description,
                max_players: maxPlayers,
                location,
                preferred_time: preferredTime
            })
            .returning()
            .execute();

        const team = result[0];

        // Add captain as first team member
        await db.insert(teamMembersTable)
            .values({
                team_id: team.id,
                player_id: captainId
            })
            .execute();

        return team;
    } catch (error) {
        console.error('Team creation failed:', error);
        throw error;
    }
}

export async function searchTeams(input: SearchTeamsInput): Promise<Team[]> {
    try {
        let query = db.select()
            .from(teamsTable);

        const conditions: SQL<unknown>[] = [];

        // Always filter for active teams
        conditions.push(eq(teamsTable.is_active, true));

        // Apply location filter
        if (input.location) {
            conditions.push(ilike(teamsTable.location, `%${input.location}%`));
        }

        // Apply preferred time filter
        if (input.preferred_time) {
            conditions.push(ilike(teamsTable.preferred_time, `%${input.preferred_time}%`));
        }

        // Apply filters
        const finalQuery = conditions.length > 0 
            ? query.where(conditions.length === 1 ? conditions[0] : and(...conditions))
            : query;

        const results = await finalQuery.execute();
        return results;
    } catch (error) {
        console.error('Team search failed:', error);
        throw error;
    }
}

export async function getTeamById(teamId: number): Promise<Team | null> {
    try {
        const results = await db.select()
            .from(teamsTable)
            .where(eq(teamsTable.id, teamId))
            .execute();

        return results.length > 0 ? results[0] : null;
    } catch (error) {
        console.error('Get team by ID failed:', error);
        throw error;
    }
}

export async function getTeamMembers(teamId: number): Promise<TeamMember[]> {
    try {
        const results = await db.select()
            .from(teamMembersTable)
            .where(and(
                eq(teamMembersTable.team_id, teamId),
                eq(teamMembersTable.is_active, true)
            ))
            .execute();

        return results;
    } catch (error) {
        console.error('Get team members failed:', error);
        throw error;
    }
}

export async function getPlayerTeams(playerId: number): Promise<Team[]> {
    try {
        // Get teams where player is captain or member
        const results = await db.select({
            id: teamsTable.id,
            captain_id: teamsTable.captain_id,
            name: teamsTable.name,
            description: teamsTable.description,
            max_players: teamsTable.max_players,
            location: teamsTable.location,
            preferred_time: teamsTable.preferred_time,
            is_active: teamsTable.is_active,
            created_at: teamsTable.created_at,
            updated_at: teamsTable.updated_at
        })
        .from(teamsTable)
        .leftJoin(teamMembersTable, eq(teamsTable.id, teamMembersTable.team_id))
        .where(and(
            eq(teamsTable.is_active, true),
            or(
                eq(teamsTable.captain_id, playerId),
                and(
                    eq(teamMembersTable.player_id, playerId),
                    eq(teamMembersTable.is_active, true)
                )
            )
        ))
        .execute();

        // Remove duplicates that might occur due to join
        const uniqueTeams = results.reduce((acc: Team[], current) => {
            const existing = acc.find(team => team.id === current.id);
            if (!existing) {
                acc.push(current);
            }
            return acc;
        }, []);

        return uniqueTeams;
    } catch (error) {
        console.error('Get player teams failed:', error);
        throw error;
    }
}

export async function invitePlayerToTeam(
    teamId: number,
    captainId: number,
    playerId: number,
    message?: string
): Promise<Invitation> {
    try {
        // Verify team exists and captain is the actual captain
        const team = await db.select()
            .from(teamsTable)
            .where(and(
                eq(teamsTable.id, teamId),
                eq(teamsTable.captain_id, captainId),
                eq(teamsTable.is_active, true)
            ))
            .execute();

        if (team.length === 0) {
            throw new Error('Team not found or user is not the captain');
        }

        // Verify target player exists and is active
        const targetPlayer = await db.select()
            .from(usersTable)
            .where(and(
                eq(usersTable.id, playerId),
                eq(usersTable.role, 'player'),
                eq(usersTable.is_active, true)
            ))
            .execute();

        if (targetPlayer.length === 0) {
            throw new Error('Target player not found or not active');
        }

        // Check if player is already a member
        const existingMember = await db.select()
            .from(teamMembersTable)
            .where(and(
                eq(teamMembersTable.team_id, teamId),
                eq(teamMembersTable.player_id, playerId),
                eq(teamMembersTable.is_active, true)
            ))
            .execute();

        if (existingMember.length > 0) {
            throw new Error('Player is already a member of this team');
        }

        // Check for existing pending invitation
        const existingInvitation = await db.select()
            .from(invitationsTable)
            .where(and(
                eq(invitationsTable.team_id, teamId),
                eq(invitationsTable.receiver_id, playerId),
                eq(invitationsTable.status, 'pending'),
                eq(invitationsTable.type, 'team_join')
            ))
            .execute();

        if (existingInvitation.length > 0) {
            throw new Error('Invitation already exists for this player');
        }

        // Create invitation
        const result = await db.insert(invitationsTable)
            .values({
                sender_id: captainId,
                receiver_id: playerId,
                team_id: teamId,
                type: 'team_join' as const,
                status: 'pending',
                message: message || null
            })
            .returning()
            .execute();

        return result[0] as Invitation;
    } catch (error) {
        console.error('Invite player to team failed:', error);
        throw error;
    }
}

export async function requestToJoinTeam(
    teamId: number,
    playerId: number,
    message?: string
): Promise<Invitation> {
    try {
        // Verify team exists and is active
        const team = await db.select()
            .from(teamsTable)
            .where(and(
                eq(teamsTable.id, teamId),
                eq(teamsTable.is_active, true)
            ))
            .execute();

        if (team.length === 0) {
            throw new Error('Team not found or not active');
        }

        const teamData = team[0];

        // Verify player exists and is active
        const player = await db.select()
            .from(usersTable)
            .where(and(
                eq(usersTable.id, playerId),
                eq(usersTable.role, 'player'),
                eq(usersTable.is_active, true)
            ))
            .execute();

        if (player.length === 0) {
            throw new Error('Player not found or not active');
        }

        // Check if player is already a member
        const existingMember = await db.select()
            .from(teamMembersTable)
            .where(and(
                eq(teamMembersTable.team_id, teamId),
                eq(teamMembersTable.player_id, playerId),
                eq(teamMembersTable.is_active, true)
            ))
            .execute();

        if (existingMember.length > 0) {
            throw new Error('Player is already a member of this team');
        }

        // Check for existing pending request
        const existingRequest = await db.select()
            .from(invitationsTable)
            .where(and(
                eq(invitationsTable.team_id, teamId),
                eq(invitationsTable.sender_id, playerId),
                eq(invitationsTable.status, 'pending'),
                eq(invitationsTable.type, 'team_join')
            ))
            .execute();

        if (existingRequest.length > 0) {
            throw new Error('Join request already exists for this team');
        }

        // Create join request
        const result = await db.insert(invitationsTable)
            .values({
                sender_id: playerId,
                receiver_id: teamData.captain_id,
                team_id: teamId,
                type: 'team_join' as const,
                status: 'pending',
                message: message || null
            })
            .returning()
            .execute();

        return result[0] as Invitation;
    } catch (error) {
        console.error('Request to join team failed:', error);
        throw error;
    }
}

export async function respondToTeamInvitation(
    invitationId: number,
    accept: boolean
): Promise<Invitation> {
    try {
        // Get the invitation
        const invitation = await db.select()
            .from(invitationsTable)
            .where(and(
                eq(invitationsTable.id, invitationId),
                eq(invitationsTable.status, 'pending'),
                eq(invitationsTable.type, 'team_join')
            ))
            .execute();

        if (invitation.length === 0) {
            throw new Error('Invitation not found or already processed');
        }

        const inviteData = invitation[0];

        // Update invitation status
        const newStatus = accept ? ('accepted' as const) : ('rejected' as const);
        const updatedInvitation = await db.update(invitationsTable)
            .set({
                status: newStatus,
                updated_at: new Date()
            })
            .where(eq(invitationsTable.id, invitationId))
            .returning()
            .execute();

        // If accepted, add player to team
        if (accept && inviteData.team_id) {
            // Determine who joins the team based on invitation direction
            const playerToAdd = inviteData.sender_id === inviteData.receiver_id 
                ? inviteData.sender_id  // This shouldn't happen, but safe fallback
                : (await db.select().from(teamsTable).where(eq(teamsTable.id, inviteData.team_id)).execute())[0]?.captain_id === inviteData.sender_id
                    ? inviteData.receiver_id  // Captain invited player
                    : inviteData.sender_id;   // Player requested to join

            await db.insert(teamMembersTable)
                .values({
                    team_id: inviteData.team_id,
                    player_id: playerToAdd
                })
                .execute();
        }

        return updatedInvitation[0] as Invitation;
    } catch (error) {
        console.error('Respond to team invitation failed:', error);
        throw error;
    }
}