import { 
  serial, 
  text, 
  pgTable, 
  timestamp, 
  numeric, 
  integer, 
  boolean,
  pgEnum,
  jsonb,
  date,
  time,
  real
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'facility_owner', 'staff_member', 'player', 'tournament_organizer']);
export const bookingStatusEnum = pgEnum('booking_status', ['pending', 'confirmed', 'rejected', 'cancelled']);
export const pitchTypeEnum = pgEnum('pitch_type', ['football_11', 'football_7', 'football_5', 'basketball', 'tennis', 'volleyball']);
export const tournamentStatusEnum = pgEnum('tournament_status', ['draft', 'pending_approval', 'published', 'active', 'completed', 'cancelled']);
export const bracketTypeEnum = pgEnum('bracket_type', ['single_elimination', 'double_elimination', 'round_robin', 'swiss']);
export const walletTransactionTypeEnum = pgEnum('wallet_transaction_type', ['topup', 'booking_payment', 'tournament_fee', 'facility_payout', 'admin_adjustment']);
export const paymentMethodEnum = pgEnum('payment_method', ['flouci', 'edinar', 'd17']);
export const messageTypeEnum = pgEnum('message_type', ['text', 'invitation', 'team_join_request']);
export const invitationStatusEnum = pgEnum('invitation_status', ['pending', 'accepted', 'rejected']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  full_name: text('full_name').notNull(),
  phone: text('phone'),
  role: userRoleEnum('role').notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Facilities table
export const facilitiesTable = pgTable('facilities', {
  id: serial('id').primaryKey(),
  owner_id: integer('owner_id').references(() => usersTable.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  address: text('address').notNull(),
  city: text('city').notNull(),
  phone: text('phone'),
  email: text('email'),
  rating: real('rating'),
  amenities: jsonb('amenities').notNull().default('[]'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Pitches table
export const pitchesTable = pgTable('pitches', {
  id: serial('id').primaryKey(),
  facility_id: integer('facility_id').references(() => facilitiesTable.id).notNull(),
  name: text('name').notNull(),
  type: pitchTypeEnum('type').notNull(),
  hourly_rate: numeric('hourly_rate', { precision: 10, scale: 2 }).notNull(),
  description: text('description'),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Staff Permissions table
export const staffPermissionsTable = pgTable('staff_permissions', {
  id: serial('id').primaryKey(),
  staff_id: integer('staff_id').references(() => usersTable.id).notNull(),
  facility_id: integer('facility_id').references(() => facilitiesTable.id).notNull(),
  role_name: text('role_name').notNull(),
  permissions: jsonb('permissions').notNull().default('[]'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Bookings table
export const bookingsTable = pgTable('bookings', {
  id: serial('id').primaryKey(),
  player_id: integer('player_id').references(() => usersTable.id).notNull(),
  pitch_id: integer('pitch_id').references(() => pitchesTable.id).notNull(),
  facility_id: integer('facility_id').references(() => facilitiesTable.id).notNull(),
  booking_date: date('booking_date').notNull(),
  start_time: time('start_time').notNull(),
  end_time: time('end_time').notNull(),
  status: bookingStatusEnum('status').default('pending').notNull(),
  total_amount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Subscriptions table
export const subscriptionsTable = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  player_id: integer('player_id').references(() => usersTable.id).notNull(),
  pitch_id: integer('pitch_id').references(() => pitchesTable.id).notNull(),
  facility_id: integer('facility_id').references(() => facilitiesTable.id).notNull(),
  day_of_week: integer('day_of_week').notNull(), // 0 = Sunday, 6 = Saturday
  start_time: time('start_time').notNull(),
  end_time: time('end_time').notNull(),
  start_date: date('start_date').notNull(),
  end_date: date('end_date').notNull(),
  total_amount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Tournaments table
export const tournamentsTable = pgTable('tournaments', {
  id: serial('id').primaryKey(),
  organizer_id: integer('organizer_id').references(() => usersTable.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  bracket_type: bracketTypeEnum('bracket_type').notNull(),
  entry_fee: numeric('entry_fee', { precision: 10, scale: 2 }).default('0').notNull(),
  max_participants: integer('max_participants').notNull(),
  registration_start: timestamp('registration_start').notNull(),
  registration_end: timestamp('registration_end').notNull(),
  tournament_start: timestamp('tournament_start').notNull(),
  tournament_end: timestamp('tournament_end').notNull(),
  status: tournamentStatusEnum('status').default('draft').notNull(),
  rules: text('rules'),
  prize_pool: numeric('prize_pool', { precision: 10, scale: 2 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Tournament Matches table
export const tournamentMatchesTable = pgTable('tournament_matches', {
  id: serial('id').primaryKey(),
  tournament_id: integer('tournament_id').references(() => tournamentsTable.id).notNull(),
  round: integer('round').notNull(),
  match_number: integer('match_number').notNull(),
  player1_id: integer('player1_id').references(() => usersTable.id),
  player2_id: integer('player2_id').references(() => usersTable.id),
  winner_id: integer('winner_id').references(() => usersTable.id),
  pitch_id: integer('pitch_id').references(() => pitchesTable.id),
  scheduled_at: timestamp('scheduled_at'),
  completed_at: timestamp('completed_at'),
  score_player1: integer('score_player1'),
  score_player2: integer('score_player2'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Tournament Participants table
export const tournamentParticipantsTable = pgTable('tournament_participants', {
  id: serial('id').primaryKey(),
  tournament_id: integer('tournament_id').references(() => tournamentsTable.id).notNull(),
  player_id: integer('player_id').references(() => usersTable.id).notNull(),
  registered_at: timestamp('registered_at').defaultNow().notNull(),
  payment_status: text('payment_status').default('pending').notNull(),
  eliminated_at: timestamp('eliminated_at')
});

// Wallets table
export const walletsTable = pgTable('wallets', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => usersTable.id).notNull().unique(),
  balance: numeric('balance', { precision: 15, scale: 2 }).default('0').notNull(),
  max_negative_balance: numeric('max_negative_balance', { precision: 15, scale: 2 }).default('0').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Wallet Transactions table
export const walletTransactionsTable = pgTable('wallet_transactions', {
  id: serial('id').primaryKey(),
  wallet_id: integer('wallet_id').references(() => walletsTable.id).notNull(),
  type: walletTransactionTypeEnum('type').notNull(),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  description: text('description'),
  reference_id: text('reference_id'),
  payment_method: paymentMethodEnum('payment_method'),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Teams table
export const teamsTable = pgTable('teams', {
  id: serial('id').primaryKey(),
  captain_id: integer('captain_id').references(() => usersTable.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  max_players: integer('max_players').notNull(),
  location: text('location'),
  preferred_time: text('preferred_time'),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Team Members table
export const teamMembersTable = pgTable('team_members', {
  id: serial('id').primaryKey(),
  team_id: integer('team_id').references(() => teamsTable.id).notNull(),
  player_id: integer('player_id').references(() => usersTable.id).notNull(),
  joined_at: timestamp('joined_at').defaultNow().notNull(),
  is_active: boolean('is_active').default(true).notNull()
});

// Messages table
export const messagesTable = pgTable('messages', {
  id: serial('id').primaryKey(),
  sender_id: integer('sender_id').references(() => usersTable.id).notNull(),
  receiver_id: integer('receiver_id').references(() => usersTable.id).notNull(),
  type: messageTypeEnum('type').notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata'),
  read_at: timestamp('read_at'),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Invitations table
export const invitationsTable = pgTable('invitations', {
  id: serial('id').primaryKey(),
  sender_id: integer('sender_id').references(() => usersTable.id).notNull(),
  receiver_id: integer('receiver_id').references(() => usersTable.id).notNull(),
  team_id: integer('team_id').references(() => teamsTable.id),
  tournament_id: integer('tournament_id').references(() => tournamentsTable.id),
  type: text('type').notNull(), // 'team_join', 'game_invite'
  status: invitationStatusEnum('status').default('pending').notNull(),
  message: text('message'),
  expires_at: timestamp('expires_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Reviews table
export const reviewsTable = pgTable('reviews', {
  id: serial('id').primaryKey(),
  player_id: integer('player_id').references(() => usersTable.id).notNull(),
  facility_id: integer('facility_id').references(() => facilitiesTable.id).notNull(),
  rating: integer('rating').notNull(), // 1-5
  comment: text('comment'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Relations
export const usersRelations = relations(usersTable, ({ many, one }) => ({
  facilities: many(facilitiesTable),
  bookings: many(bookingsTable),
  tournaments: many(tournamentsTable),
  wallet: one(walletsTable),
  sentMessages: many(messagesTable, { relationName: 'sender' }),
  receivedMessages: many(messagesTable, { relationName: 'receiver' }),
  teams: many(teamsTable),
  teamMemberships: many(teamMembersTable),
  reviews: many(reviewsTable)
}));

export const facilitiesRelations = relations(facilitiesTable, ({ one, many }) => ({
  owner: one(usersTable, {
    fields: [facilitiesTable.owner_id],
    references: [usersTable.id]
  }),
  pitches: many(pitchesTable),
  bookings: many(bookingsTable),
  reviews: many(reviewsTable)
}));

export const pitchesRelations = relations(pitchesTable, ({ one, many }) => ({
  facility: one(facilitiesTable, {
    fields: [pitchesTable.facility_id],
    references: [facilitiesTable.id]
  }),
  bookings: many(bookingsTable),
  tournamentMatches: many(tournamentMatchesTable)
}));

export const bookingsRelations = relations(bookingsTable, ({ one }) => ({
  player: one(usersTable, {
    fields: [bookingsTable.player_id],
    references: [usersTable.id]
  }),
  pitch: one(pitchesTable, {
    fields: [bookingsTable.pitch_id],
    references: [pitchesTable.id]
  }),
  facility: one(facilitiesTable, {
    fields: [bookingsTable.facility_id],
    references: [facilitiesTable.id]
  })
}));

export const tournamentsRelations = relations(tournamentsTable, ({ one, many }) => ({
  organizer: one(usersTable, {
    fields: [tournamentsTable.organizer_id],
    references: [usersTable.id]
  }),
  participants: many(tournamentParticipantsTable),
  matches: many(tournamentMatchesTable)
}));

export const walletsRelations = relations(walletsTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [walletsTable.user_id],
    references: [usersTable.id]
  }),
  transactions: many(walletTransactionsTable)
}));

export const teamsRelations = relations(teamsTable, ({ one, many }) => ({
  captain: one(usersTable, {
    fields: [teamsTable.captain_id],
    references: [usersTable.id]
  }),
  members: many(teamMembersTable)
}));

// Export all tables for proper query building
export const tables = {
  users: usersTable,
  facilities: facilitiesTable,
  pitches: pitchesTable,
  staffPermissions: staffPermissionsTable,
  bookings: bookingsTable,
  subscriptions: subscriptionsTable,
  tournaments: tournamentsTable,
  tournamentMatches: tournamentMatchesTable,
  tournamentParticipants: tournamentParticipantsTable,
  wallets: walletsTable,
  walletTransactions: walletTransactionsTable,
  teams: teamsTable,
  teamMembers: teamMembersTable,
  messages: messagesTable,
  invitations: invitationsTable,
  reviews: reviewsTable
};