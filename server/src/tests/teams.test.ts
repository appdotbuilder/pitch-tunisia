import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, teamsTable, teamMembersTable, invitationsTable } from '../db/schema';
import { 
    createTeam,
    searchTeams,
    getTeamById,
    getTeamMembers,
    getPlayerTeams,
    invitePlayerToTeam,
    requestToJoinTeam,
    respondToTeamInvitation
} from '../handlers/teams';
import { type SearchTeamsInput } from '../schema';
import { eq, and } from 'drizzle-orm';

// Test data
const createTestUser = async (username: string, role: 'player' | 'admin' = 'player') => {
    const result = await db.insert(usersTable)
        .values({
            username,
            email: `${username}@test.com`,
            password_hash: 'hashed_password',
            full_name: `${username} User`,
            role,
            is_active: true
        })
        .returning()
        .execute();
    return result[0];
};

const createTestTeam = async (captainId: number, name: string = 'Test Team') => {
    const result = await db.insert(teamsTable)
        .values({
            captain_id: captainId,
            name,
            description: 'A test team',
            max_players: 11,
            location: 'Test City',
            preferred_time: 'Evening'
        })
        .returning()
        .execute();
    return result[0];
};

describe('Teams Handlers', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    describe('createTeam', () => {
        it('should create a team and add captain as member', async () => {
            const captain = await createTestUser('captain');

            const team = await createTeam(
                captain.id,
                'Football Warriors',
                'Professional football team',
                11,
                'Tunis',
                'Evenings'
            );

            expect(team.name).toEqual('Football Warriors');
            expect(team.captain_id).toEqual(captain.id);
            expect(team.description).toEqual('Professional football team');
            expect(team.max_players).toEqual(11);
            expect(team.location).toEqual('Tunis');
            expect(team.preferred_time).toEqual('Evenings');
            expect(team.is_active).toEqual(true);
            expect(team.id).toBeDefined();
            expect(team.created_at).toBeInstanceOf(Date);

            // Verify captain is added as member
            const members = await db.select()
                .from(teamMembersTable)
                .where(eq(teamMembersTable.team_id, team.id))
                .execute();

            expect(members).toHaveLength(1);
            expect(members[0].player_id).toEqual(captain.id);
            expect(members[0].is_active).toEqual(true);
        });

        it('should fail if captain is not an active player', async () => {
            const admin = await createTestUser('admin', 'admin');

            await expect(createTeam(
                admin.id,
                'Test Team',
                null,
                11,
                null,
                null
            )).rejects.toThrow(/captain must be an active player/i);
        });

        it('should fail if captain does not exist', async () => {
            await expect(createTeam(
                999,
                'Test Team',
                null,
                11,
                null,
                null
            )).rejects.toThrow(/captain must be an active player/i);
        });
    });

    describe('searchTeams', () => {
        it('should return all active teams when no filters applied', async () => {
            const captain1 = await createTestUser('captain1');
            const captain2 = await createTestUser('captain2');

            await createTestTeam(captain1.id, 'Team Alpha');
            await createTestTeam(captain2.id, 'Team Beta');

            const searchInput: SearchTeamsInput = {};
            const results = await searchTeams(searchInput);

            expect(results).toHaveLength(2);
            expect(results.map(t => t.name)).toContain('Team Alpha');
            expect(results.map(t => t.name)).toContain('Team Beta');
        });

        it('should filter teams by location', async () => {
            const captain1 = await createTestUser('captain1');
            const captain2 = await createTestUser('captain2');

            await db.insert(teamsTable)
                .values({
                    captain_id: captain1.id,
                    name: 'Tunis Team',
                    max_players: 11,
                    location: 'Tunis'
                })
                .execute();

            await db.insert(teamsTable)
                .values({
                    captain_id: captain2.id,
                    name: 'Sfax Team',
                    max_players: 11,
                    location: 'Sfax'
                })
                .execute();

            const searchInput: SearchTeamsInput = {
                location: 'Tunis'
            };
            const results = await searchTeams(searchInput);

            expect(results).toHaveLength(1);
            expect(results[0].name).toEqual('Tunis Team');
            expect(results[0].location).toEqual('Tunis');
        });

        it('should filter teams by preferred time', async () => {
            const captain1 = await createTestUser('captain1');
            const captain2 = await createTestUser('captain2');

            await db.insert(teamsTable)
                .values({
                    captain_id: captain1.id,
                    name: 'Morning Team',
                    max_players: 11,
                    preferred_time: 'Morning'
                })
                .execute();

            await db.insert(teamsTable)
                .values({
                    captain_id: captain2.id,
                    name: 'Evening Team',
                    max_players: 11,
                    preferred_time: 'Evening'
                })
                .execute();

            const searchInput: SearchTeamsInput = {
                preferred_time: 'Evening'
            };
            const results = await searchTeams(searchInput);

            expect(results).toHaveLength(1);
            expect(results[0].name).toEqual('Evening Team');
            expect(results[0].preferred_time).toEqual('Evening');
        });

        it('should not return inactive teams', async () => {
            const captain = await createTestUser('captain');

            await db.insert(teamsTable)
                .values({
                    captain_id: captain.id,
                    name: 'Inactive Team',
                    max_players: 11,
                    is_active: false
                })
                .execute();

            const searchInput: SearchTeamsInput = {};
            const results = await searchTeams(searchInput);

            expect(results).toHaveLength(0);
        });
    });

    describe('getTeamById', () => {
        it('should return team by ID', async () => {
            const captain = await createTestUser('captain');
            const team = await createTestTeam(captain.id);

            const result = await getTeamById(team.id);

            expect(result).toBeDefined();
            expect(result!.id).toEqual(team.id);
            expect(result!.name).toEqual(team.name);
            expect(result!.captain_id).toEqual(captain.id);
        });

        it('should return null for non-existent team', async () => {
            const result = await getTeamById(999);
            expect(result).toBeNull();
        });
    });

    describe('getTeamMembers', () => {
        it('should return active team members', async () => {
            const captain = await createTestUser('captain');
            const player1 = await createTestUser('player1');
            const player2 = await createTestUser('player2');
            const team = await createTestTeam(captain.id);

            // Add members
            await db.insert(teamMembersTable)
                .values([
                    { team_id: team.id, player_id: captain.id },
                    { team_id: team.id, player_id: player1.id },
                    { team_id: team.id, player_id: player2.id, is_active: false } // Inactive member
                ])
                .execute();

            const members = await getTeamMembers(team.id);

            expect(members).toHaveLength(2);
            const memberIds = members.map(m => m.player_id);
            expect(memberIds).toContain(captain.id);
            expect(memberIds).toContain(player1.id);
            expect(memberIds).not.toContain(player2.id);
        });

        it('should return empty array for team with no members', async () => {
            const captain = await createTestUser('captain');
            const team = await createTestTeam(captain.id);

            const members = await getTeamMembers(team.id);
            expect(members).toHaveLength(0);
        });
    });

    describe('getPlayerTeams', () => {
        it('should return teams where player is captain', async () => {
            const player = await createTestUser('player');
            const team1 = await createTestTeam(player.id, 'Team Alpha');
            const team2 = await createTestTeam(player.id, 'Team Beta');

            const teams = await getPlayerTeams(player.id);

            expect(teams).toHaveLength(2);
            const teamNames = teams.map(t => t.name);
            expect(teamNames).toContain('Team Alpha');
            expect(teamNames).toContain('Team Beta');
        });

        it('should return teams where player is member', async () => {
            const captain = await createTestUser('captain');
            const player = await createTestUser('player');
            const team = await createTestTeam(captain.id);

            // Add player as member
            await db.insert(teamMembersTable)
                .values({
                    team_id: team.id,
                    player_id: player.id
                })
                .execute();

            const teams = await getPlayerTeams(player.id);

            expect(teams).toHaveLength(1);
            expect(teams[0].id).toEqual(team.id);
            expect(teams[0].name).toEqual(team.name);
        });

        it('should not return inactive teams', async () => {
            const player = await createTestUser('player');
            
            await db.insert(teamsTable)
                .values({
                    captain_id: player.id,
                    name: 'Inactive Team',
                    max_players: 11,
                    is_active: false
                })
                .execute();

            const teams = await getPlayerTeams(player.id);
            expect(teams).toHaveLength(0);
        });
    });

    describe('invitePlayerToTeam', () => {
        it('should create team invitation from captain to player', async () => {
            const captain = await createTestUser('captain');
            const player = await createTestUser('player');
            const team = await createTestTeam(captain.id);

            const invitation = await invitePlayerToTeam(
                team.id,
                captain.id,
                player.id,
                'Join our awesome team!'
            );

            expect(invitation.sender_id).toEqual(captain.id);
            expect(invitation.receiver_id).toEqual(player.id);
            expect(invitation.team_id).toEqual(team.id);
            expect(invitation.type).toEqual('team_join');
            expect(invitation.status).toEqual('pending');
            expect(invitation.message).toEqual('Join our awesome team!');
            expect(invitation.id).toBeDefined();
        });

        it('should fail if sender is not the team captain', async () => {
            const captain = await createTestUser('captain');
            const fakeCaptain = await createTestUser('fake_captain');
            const player = await createTestUser('player');
            const team = await createTestTeam(captain.id);

            await expect(invitePlayerToTeam(
                team.id,
                fakeCaptain.id,
                player.id
            )).rejects.toThrow(/team not found or user is not the captain/i);
        });

        it('should fail if target player does not exist', async () => {
            const captain = await createTestUser('captain');
            const team = await createTestTeam(captain.id);

            await expect(invitePlayerToTeam(
                team.id,
                captain.id,
                999
            )).rejects.toThrow(/target player not found or not active/i);
        });

        it('should fail if player is already a team member', async () => {
            const captain = await createTestUser('captain');
            const player = await createTestUser('player');
            const team = await createTestTeam(captain.id);

            // Add player as member
            await db.insert(teamMembersTable)
                .values({
                    team_id: team.id,
                    player_id: player.id
                })
                .execute();

            await expect(invitePlayerToTeam(
                team.id,
                captain.id,
                player.id
            )).rejects.toThrow(/player is already a member of this team/i);
        });

        it('should fail if invitation already exists', async () => {
            const captain = await createTestUser('captain');
            const player = await createTestUser('player');
            const team = await createTestTeam(captain.id);

            // Create existing invitation
            await db.insert(invitationsTable)
                .values({
                    sender_id: captain.id,
                    receiver_id: player.id,
                    team_id: team.id,
                    type: 'team_join',
                    status: 'pending'
                })
                .execute();

            await expect(invitePlayerToTeam(
                team.id,
                captain.id,
                player.id
            )).rejects.toThrow(/invitation already exists for this player/i);
        });
    });

    describe('requestToJoinTeam', () => {
        it('should create join request from player to team captain', async () => {
            const captain = await createTestUser('captain');
            const player = await createTestUser('player');
            const team = await createTestTeam(captain.id);

            const invitation = await requestToJoinTeam(
                team.id,
                player.id,
                'I would like to join your team!'
            );

            expect(invitation.sender_id).toEqual(player.id);
            expect(invitation.receiver_id).toEqual(captain.id);
            expect(invitation.team_id).toEqual(team.id);
            expect(invitation.type).toEqual('team_join');
            expect(invitation.status).toEqual('pending');
            expect(invitation.message).toEqual('I would like to join your team!');
        });

        it('should fail if team does not exist', async () => {
            const player = await createTestUser('player');

            await expect(requestToJoinTeam(
                999,
                player.id
            )).rejects.toThrow(/team not found or not active/i);
        });

        it('should fail if player is already a member', async () => {
            const captain = await createTestUser('captain');
            const player = await createTestUser('player');
            const team = await createTestTeam(captain.id);

            // Add player as member
            await db.insert(teamMembersTable)
                .values({
                    team_id: team.id,
                    player_id: player.id
                })
                .execute();

            await expect(requestToJoinTeam(
                team.id,
                player.id
            )).rejects.toThrow(/player is already a member of this team/i);
        });

        it('should fail if join request already exists', async () => {
            const captain = await createTestUser('captain');
            const player = await createTestUser('player');
            const team = await createTestTeam(captain.id);

            // Create existing request
            await db.insert(invitationsTable)
                .values({
                    sender_id: player.id,
                    receiver_id: captain.id,
                    team_id: team.id,
                    type: 'team_join',
                    status: 'pending'
                })
                .execute();

            await expect(requestToJoinTeam(
                team.id,
                player.id
            )).rejects.toThrow(/join request already exists for this team/i);
        });
    });

    describe('respondToTeamInvitation', () => {
        it('should accept invitation and add player to team', async () => {
            const captain = await createTestUser('captain');
            const player = await createTestUser('player');
            const team = await createTestTeam(captain.id);

            // Create invitation
            const inviteResult = await db.insert(invitationsTable)
                .values({
                    sender_id: captain.id,
                    receiver_id: player.id,
                    team_id: team.id,
                    type: 'team_join',
                    status: 'pending'
                })
                .returning()
                .execute();

            const invitation = inviteResult[0];

            const response = await respondToTeamInvitation(invitation.id, true);

            expect(response.status).toEqual('accepted');
            expect(response.updated_at).toBeInstanceOf(Date);

            // Verify player was added to team
            const members = await db.select()
                .from(teamMembersTable)
                .where(and(
                    eq(teamMembersTable.team_id, team.id),
                    eq(teamMembersTable.player_id, player.id)
                ))
                .execute();

            expect(members).toHaveLength(1);
            expect(members[0].is_active).toEqual(true);
        });

        it('should reject invitation without adding player to team', async () => {
            const captain = await createTestUser('captain');
            const player = await createTestUser('player');
            const team = await createTestTeam(captain.id);

            // Create invitation
            const inviteResult = await db.insert(invitationsTable)
                .values({
                    sender_id: captain.id,
                    receiver_id: player.id,
                    team_id: team.id,
                    type: 'team_join',
                    status: 'pending'
                })
                .returning()
                .execute();

            const invitation = inviteResult[0];

            const response = await respondToTeamInvitation(invitation.id, false);

            expect(response.status).toEqual('rejected');

            // Verify player was NOT added to team
            const members = await db.select()
                .from(teamMembersTable)
                .where(and(
                    eq(teamMembersTable.team_id, team.id),
                    eq(teamMembersTable.player_id, player.id)
                ))
                .execute();

            expect(members).toHaveLength(0);
        });

        it('should handle join request acceptance', async () => {
            const captain = await createTestUser('captain');
            const player = await createTestUser('player');
            const team = await createTestTeam(captain.id);

            // Create join request (player -> captain)
            const requestResult = await db.insert(invitationsTable)
                .values({
                    sender_id: player.id,
                    receiver_id: captain.id,
                    team_id: team.id,
                    type: 'team_join',
                    status: 'pending'
                })
                .returning()
                .execute();

            const request = requestResult[0];

            const response = await respondToTeamInvitation(request.id, true);

            expect(response.status).toEqual('accepted');

            // Verify player was added to team
            const members = await db.select()
                .from(teamMembersTable)
                .where(and(
                    eq(teamMembersTable.team_id, team.id),
                    eq(teamMembersTable.player_id, player.id)
                ))
                .execute();

            expect(members).toHaveLength(1);
        });

        it('should fail if invitation does not exist', async () => {
            await expect(respondToTeamInvitation(999, true))
                .rejects.toThrow(/invitation not found or already processed/i);
        });

        it('should fail if invitation is already processed', async () => {
            const captain = await createTestUser('captain');
            const player = await createTestUser('player');
            const team = await createTestTeam(captain.id);

            // Create processed invitation
            const inviteResult = await db.insert(invitationsTable)
                .values({
                    sender_id: captain.id,
                    receiver_id: player.id,
                    team_id: team.id,
                    type: 'team_join',
                    status: 'accepted'
                })
                .returning()
                .execute();

            const invitation = inviteResult[0];

            await expect(respondToTeamInvitation(invitation.id, true))
                .rejects.toThrow(/invitation not found or already processed/i);
        });
    });
});