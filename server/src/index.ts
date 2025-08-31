import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import { 
  createUserInputSchema,
  createFacilityInputSchema,
  createBookingInputSchema,
  updateBookingStatusInputSchema,
  createTournamentInputSchema,
  updateTournamentStatusInputSchema,
  createMessageInputSchema,
  searchPitchesInputSchema,
  searchTeamsInputSchema,
  paymentMethodEnum
} from './schema';

// Import handlers
import { registerUser, loginUser, getUserById } from './handlers/auth';
import { 
  createFacility, 
  getFacilitiesByOwner, 
  getFacilityById,
  getFacilityPitches,
  searchFacilities 
} from './handlers/facilities';
import { 
  createBooking, 
  updateBookingStatus, 
  getPlayerBookings,
  getFacilityBookings,
  searchAvailablePitches,
  checkPlayerDailyBookingLimit,
  getPendingBookings
} from './handlers/bookings';
import { 
  createTournament,
  updateTournamentStatus,
  registerForTournament,
  getTournaments,
  getTournamentById,
  getTournamentParticipants,
  getTournamentMatches,
  scheduleMatch,
  recordMatchResult
} from './handlers/tournaments';
import { 
  getWalletByUserId,
  topUpWallet,
  debitWallet,
  creditWallet,
  getWalletTransactions,
  checkWalletBalance,
  getFacilityWalletSummary
} from './handlers/wallet';
import { 
  createTeam,
  searchTeams,
  getTeamById,
  getTeamMembers,
  getPlayerTeams,
  invitePlayerToTeam,
  requestToJoinTeam,
  respondToTeamInvitation
} from './handlers/teams';
import { 
  sendMessage,
  getConversation,
  getUserConversations,
  markMessagesAsRead,
  sendGameInvitation,
  getPendingInvitations,
  respondToInvitation
} from './handlers/messaging';
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
} from './handlers/admin';
import { 
  createStaffMember,
  updateStaffPermissions,
  getStaffPermissions,
  getFacilityStaff,
  removeStaffMember,
  checkStaffPermission,
  getStaffFacilities
} from './handlers/staff';
import { 
  createReview,
  getFacilityReviews,
  getPlayerReviews,
  updateReview,
  deleteReview,
  calculateFacilityRating
} from './handlers/reviews';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  auth: router({
    register: publicProcedure
      .input(createUserInputSchema)
      .mutation(({ input }) => registerUser(input)),
    
    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string() }))
      .mutation(({ input }) => loginUser(input.email, input.password)),
    
    getUser: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getUserById(input.userId)),
  }),

  // Facility management routes
  facilities: router({
    create: publicProcedure
      .input(createFacilityInputSchema)
      .mutation(({ input }) => createFacility(input)),
    
    getByOwner: publicProcedure
      .input(z.object({ ownerId: z.number() }))
      .query(({ input }) => getFacilitiesByOwner(input.ownerId)),
    
    getById: publicProcedure
      .input(z.object({ facilityId: z.number() }))
      .query(({ input }) => getFacilityById(input.facilityId)),
    
    getPitches: publicProcedure
      .input(z.object({ facilityId: z.number() }))
      .query(({ input }) => getFacilityPitches(input.facilityId)),
    
    getReviews: publicProcedure
      .input(z.object({ facilityId: z.number() }))
      .query(({ input }) => getFacilityReviews(input.facilityId, 20, 0)),
    
    search: publicProcedure
      .input(z.object({ 
        city: z.string().optional(), 
        amenities: z.array(z.string()).optional(), 
        minRating: z.number().optional() 
      }))
      .query(({ input }) => searchFacilities(input)),
  }),

  // Booking management routes
  bookings: router({
    create: publicProcedure
      .input(createBookingInputSchema)
      .mutation(({ input }) => createBooking(input)),
    
    updateStatus: publicProcedure
      .input(updateBookingStatusInputSchema)
      .mutation(({ input }) => updateBookingStatus(input)),
    
    getPlayerBookings: publicProcedure
      .input(z.object({ playerId: z.number() }))
      .query(({ input }) => getPlayerBookings(input.playerId)),
    
    getFacilityBookings: publicProcedure
      .input(z.object({ facilityId: z.number(), date: z.string().optional() }))
      .query(({ input }) => getFacilityBookings(input.facilityId, input.date)),
    
    searchPitches: publicProcedure
      .input(searchPitchesInputSchema)
      .query(({ input }) => searchAvailablePitches(input)),
    
    checkDailyLimit: publicProcedure
      .input(z.object({ playerId: z.number(), date: z.string() }))
      .query(({ input }) => checkPlayerDailyBookingLimit(input.playerId, input.date)),
    
    getPending: publicProcedure
      .input(z.object({ facilityId: z.number().optional() }))
      .query(({ input }) => getPendingBookings(input.facilityId)),
  }),

  // Tournament management routes
  tournaments: router({
    create: publicProcedure
      .input(createTournamentInputSchema)
      .mutation(({ input }) => createTournament(input)),
    
    updateStatus: publicProcedure
      .input(updateTournamentStatusInputSchema)
      .mutation(({ input }) => updateTournamentStatus(input)),
    
    register: publicProcedure
      .input(z.object({ tournamentId: z.number(), playerId: z.number() }))
      .mutation(({ input }) => registerForTournament(input.tournamentId, input.playerId)),
    
    getAll: publicProcedure
      .input(z.object({ status: z.string().optional() }))
      .query(({ input }) => getTournaments(input.status)),
    
    getById: publicProcedure
      .input(z.object({ tournamentId: z.number() }))
      .query(({ input }) => getTournamentById(input.tournamentId)),
    
    getParticipants: publicProcedure
      .input(z.object({ tournamentId: z.number() }))
      .query(({ input }) => getTournamentParticipants(input.tournamentId)),
    
    getMatches: publicProcedure
      .input(z.object({ tournamentId: z.number() }))
      .query(({ input }) => getTournamentMatches(input.tournamentId)),
    
    scheduleMatch: publicProcedure
      .input(z.object({ matchId: z.number(), pitchId: z.number(), scheduledAt: z.string() }))
      .mutation(({ input }) => scheduleMatch(input.matchId, input.pitchId, new Date(input.scheduledAt))),
    
    recordResult: publicProcedure
      .input(z.object({ matchId: z.number(), winnerId: z.number(), scorePlayer1: z.number(), scorePlayer2: z.number() }))
      .mutation(({ input }) => recordMatchResult(input.matchId, input.winnerId, input.scorePlayer1, input.scorePlayer2)),
  }),

  // Wallet management routes
  wallet: router({
    getByUser: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getWalletByUserId(input.userId)),
    
    topUp: publicProcedure
      .input(z.object({ 
        userId: z.number(), 
        amount: z.number(), 
        paymentMethod: paymentMethodEnum, 
        referenceId: z.string().optional() 
      }))
      .mutation(({ input }) => topUpWallet(input.userId, input.amount, input.paymentMethod, input.referenceId)),
    
    debit: publicProcedure
      .input(z.object({ 
        userId: z.number(), 
        amount: z.number(), 
        type: z.enum(['booking_payment', 'tournament_fee']), 
        description: z.string().optional(), 
        referenceId: z.string().optional() 
      }))
      .mutation(({ input }) => debitWallet(input.userId, input.amount, input.type, input.description, input.referenceId)),
    
    credit: publicProcedure
      .input(z.object({ 
        userId: z.number(), 
        amount: z.number(), 
        type: z.enum(['facility_payout', 'admin_adjustment']), 
        description: z.string().optional(), 
        referenceId: z.string().optional() 
      }))
      .mutation(({ input }) => creditWallet(input.userId, input.amount, input.type, input.description, input.referenceId)),
    
    getTransactions: publicProcedure
      .input(z.object({ userId: z.number(), limit: z.number().optional() }))
      .query(({ input }) => getWalletTransactions(input.userId, input.limit)),
    
    checkBalance: publicProcedure
      .input(z.object({ userId: z.number(), requiredAmount: z.number() }))
      .query(({ input }) => checkWalletBalance(input.userId, input.requiredAmount)),
    
    getFacilitySummary: publicProcedure
      .query(() => getFacilityWalletSummary()),
  }),

  // Team management routes
  teams: router({
    create: publicProcedure
      .input(z.object({ 
        captainId: z.number(), 
        name: z.string(), 
        description: z.string().optional(), 
        maxPlayers: z.number(), 
        location: z.string().optional(), 
        preferredTime: z.string().optional() 
      }))
      .mutation(({ input }) => createTeam(input.captainId, input.name, input.description || null, input.maxPlayers, input.location || null, input.preferredTime || null)),
    
    search: publicProcedure
      .input(searchTeamsInputSchema)
      .query(({ input }) => searchTeams(input)),
    
    getById: publicProcedure
      .input(z.object({ teamId: z.number() }))
      .query(({ input }) => getTeamById(input.teamId)),
    
    getMembers: publicProcedure
      .input(z.object({ teamId: z.number() }))
      .query(({ input }) => getTeamMembers(input.teamId)),
    
    getPlayerTeams: publicProcedure
      .input(z.object({ playerId: z.number() }))
      .query(({ input }) => getPlayerTeams(input.playerId)),
    
    invitePlayer: publicProcedure
      .input(z.object({ teamId: z.number(), captainId: z.number(), playerId: z.number(), message: z.string().optional() }))
      .mutation(({ input }) => invitePlayerToTeam(input.teamId, input.captainId, input.playerId, input.message)),
    
    requestJoin: publicProcedure
      .input(z.object({ teamId: z.number(), playerId: z.number(), message: z.string().optional() }))
      .mutation(({ input }) => requestToJoinTeam(input.teamId, input.playerId, input.message)),
    
    respondToInvitation: publicProcedure
      .input(z.object({ invitationId: z.number(), accept: z.boolean() }))
      .mutation(({ input }) => respondToTeamInvitation(input.invitationId, input.accept)),
  }),

  // Messaging routes
  messaging: router({
    send: publicProcedure
      .input(createMessageInputSchema)
      .mutation(({ input }) => sendMessage(input)),
    
    getConversation: publicProcedure
      .input(z.object({ user1Id: z.number(), user2Id: z.number(), limit: z.number().optional() }))
      .query(({ input }) => getConversation(input.user1Id, input.user2Id, input.limit)),
    
    getUserConversations: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getUserConversations(input.userId)),
    
    markAsRead: publicProcedure
      .input(z.object({ userId: z.number(), otherUserId: z.number() }))
      .mutation(({ input }) => markMessagesAsRead(input.userId, input.otherUserId)),
    
    sendGameInvitation: publicProcedure
      .input(z.object({ 
        senderId: z.number(), 
        receiverId: z.number(), 
        pitchId: z.number(), 
        proposedTime: z.string(), 
        message: z.string().optional() 
      }))
      .mutation(({ input }) => sendGameInvitation(input.senderId, input.receiverId, input.pitchId, new Date(input.proposedTime), input.message)),
    
    getPendingInvitations: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getPendingInvitations(input.userId)),
    
    respondToInvitation: publicProcedure
      .input(z.object({ invitationId: z.number(), userId: z.number(), accept: z.boolean() }))
      .mutation(({ input }) => respondToInvitation(input.invitationId, input.userId, input.accept)),
  }),

  // Admin routes
  admin: router({
    getAllUsers: publicProcedure
      .input(z.object({ role: z.string().optional(), isActive: z.boolean().optional() }))
      .query(({ input }) => getAllUsers(input.role, input.isActive)),
    
    updateUserStatus: publicProcedure
      .input(z.object({ userId: z.number(), isActive: z.boolean() }))
      .mutation(({ input }) => updateUserStatus(input.userId, input.isActive)),
    
    updateUserRole: publicProcedure
      .input(z.object({ userId: z.number(), role: z.string() }))
      .mutation(({ input }) => updateUserRole(input.userId, input.role)),
    
    getPendingTournamentApprovals: publicProcedure
      .query(() => getPendingTournamentApprovals()),
    
    approveTournament: publicProcedure
      .input(z.object({ tournamentId: z.number(), approved: z.boolean() }))
      .mutation(({ input }) => approveTournament(input.tournamentId, input.approved)),
    
    getStatistics: publicProcedure
      .query(() => getPlatformStatistics()),
    
    getFinancialSettlements: publicProcedure
      .query(() => getFinancialSettlements()),
    
    setMaxNegativeBalance: publicProcedure
      .input(z.object({ userId: z.number(), maxAmount: z.number() }))
      .mutation(({ input }) => setMaxNegativeBalance(input.userId, input.maxAmount)),
    
    adjustWalletBalance: publicProcedure
      .input(z.object({ userId: z.number(), amount: z.number(), description: z.string() }))
      .mutation(({ input }) => adjustWalletBalance(input.userId, input.amount, input.description)),
    
    getTournamentOrganizerApplications: publicProcedure
      .query(() => getTournamentOrganizerApplications()),
  }),

  // Staff management routes
  staff: router({
    create: publicProcedure
      .input(z.object({ 
        facilityOwnerId: z.number(), 
        staffUserId: z.number(), 
        facilityId: z.number(), 
        roleName: z.string(), 
        permissions: z.array(z.string()) 
      }))
      .mutation(({ input }) => createStaffMember(input.facilityOwnerId, input.staffUserId, input.facilityId, input.roleName, input.permissions)),
    
    updatePermissions: publicProcedure
      .input(z.object({ staffPermissionId: z.number(), permissions: z.array(z.string()), ownerId: z.number() }))
      .mutation(({ input }) => updateStaffPermissions(input.staffPermissionId, input.permissions, input.ownerId)),
    
    getPermissions: publicProcedure
      .input(z.object({ staffId: z.number(), facilityId: z.number() }))
      .query(({ input }) => getStaffPermissions(input.staffId, input.facilityId)),
    
    getFacilityStaff: publicProcedure
      .input(z.object({ facilityId: z.number(), ownerId: z.number() }))
      .query(({ input }) => getFacilityStaff(input.facilityId, input.ownerId)),
    
    remove: publicProcedure
      .input(z.object({ staffPermissionId: z.number(), ownerId: z.number() }))
      .mutation(({ input }) => removeStaffMember(input.staffPermissionId, input.ownerId)),
    
    checkPermission: publicProcedure
      .input(z.object({ staffId: z.number(), facilityId: z.number(), requiredPermission: z.string() }))
      .query(({ input }) => checkStaffPermission(input.staffId, input.facilityId, input.requiredPermission)),
    
    getStaffFacilities: publicProcedure
      .input(z.object({ staffId: z.number() }))
      .query(({ input }) => getStaffFacilities(input.staffId)),
  }),

  // Review management routes
  reviews: router({
    create: publicProcedure
      .input(z.object({ playerId: z.number(), facilityId: z.number(), rating: z.number(), comment: z.string().optional() }))
      .mutation(({ input }) => createReview(input.playerId, input.facilityId, input.rating, input.comment || null)),
    
    getFacilityReviews: publicProcedure
      .input(z.object({ facilityId: z.number(), limit: z.number().optional(), offset: z.number().optional() }))
      .query(({ input }) => getFacilityReviews(input.facilityId, input.limit, input.offset)),
    
    getPlayerReviews: publicProcedure
      .input(z.object({ playerId: z.number() }))
      .query(({ input }) => getPlayerReviews(input.playerId)),
    
    update: publicProcedure
      .input(z.object({ reviewId: z.number(), playerId: z.number(), rating: z.number(), comment: z.string().optional() }))
      .mutation(({ input }) => updateReview(input.reviewId, input.playerId, input.rating, input.comment || null)),
    
    delete: publicProcedure
      .input(z.object({ reviewId: z.number(), playerId: z.number() }))
      .mutation(({ input }) => deleteReview(input.reviewId, input.playerId)),
    
    calculateRating: publicProcedure
      .input(z.object({ facilityId: z.number() }))
      .query(({ input }) => calculateFacilityRating(input.facilityId)),
  }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
}

start();