import { z } from 'zod';

// Enums
export const userRoleEnum = z.enum(['admin', 'facility_owner', 'staff_member', 'player', 'tournament_organizer']);
export const bookingStatusEnum = z.enum(['pending', 'confirmed', 'rejected', 'cancelled']);
export const pitchTypeEnum = z.enum(['football_11', 'football_7', 'football_5', 'basketball', 'tennis', 'volleyball']);
export const tournamentStatusEnum = z.enum(['draft', 'pending_approval', 'published', 'active', 'completed', 'cancelled']);
export const bracketTypeEnum = z.enum(['single_elimination', 'double_elimination', 'round_robin', 'swiss']);
export const walletTransactionTypeEnum = z.enum(['topup', 'booking_payment', 'tournament_fee', 'facility_payout', 'admin_adjustment']);
export const paymentMethodEnum = z.enum(['flouci', 'edinar', 'd17']);
export const messageTypeEnum = z.enum(['text', 'invitation', 'team_join_request']);
export const invitationStatusEnum = z.enum(['pending', 'accepted', 'rejected']);

// User schema
export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().email(),
  password_hash: z.string(),
  full_name: z.string(),
  phone: z.string().nullable(),
  role: userRoleEnum,
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Facility schema
export const facilitySchema = z.object({
  id: z.number(),
  owner_id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  address: z.string(),
  city: z.string(),
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  rating: z.number().nullable(),
  amenities: z.array(z.string()),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Facility = z.infer<typeof facilitySchema>;

// Pitch schema
export const pitchSchema = z.object({
  id: z.number(),
  facility_id: z.number(),
  name: z.string(),
  type: pitchTypeEnum,
  hourly_rate: z.number(),
  description: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Pitch = z.infer<typeof pitchSchema>;

// Staff Permission schema
export const staffPermissionSchema = z.object({
  id: z.number(),
  staff_id: z.number(),
  facility_id: z.number(),
  role_name: z.string(),
  permissions: z.array(z.string()),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type StaffPermission = z.infer<typeof staffPermissionSchema>;

// Booking schema
export const bookingSchema = z.object({
  id: z.number(),
  player_id: z.number(),
  pitch_id: z.number(),
  facility_id: z.number(),
  booking_date: z.coerce.date(),
  start_time: z.string(),
  end_time: z.string(),
  status: bookingStatusEnum,
  total_amount: z.number(),
  notes: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Booking = z.infer<typeof bookingSchema>;

// Subscription schema
export const subscriptionSchema = z.object({
  id: z.number(),
  player_id: z.number(),
  pitch_id: z.number(),
  facility_id: z.number(),
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string(),
  end_time: z.string(),
  start_date: z.coerce.date(),
  end_date: z.coerce.date(),
  total_amount: z.number(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Subscription = z.infer<typeof subscriptionSchema>;

// Tournament schema
export const tournamentSchema = z.object({
  id: z.number(),
  organizer_id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  bracket_type: bracketTypeEnum,
  entry_fee: z.number(),
  max_participants: z.number().int(),
  registration_start: z.coerce.date(),
  registration_end: z.coerce.date(),
  tournament_start: z.coerce.date(),
  tournament_end: z.coerce.date(),
  status: tournamentStatusEnum,
  rules: z.string().nullable(),
  prize_pool: z.number().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Tournament = z.infer<typeof tournamentSchema>;

// Tournament Match schema
export const tournamentMatchSchema = z.object({
  id: z.number(),
  tournament_id: z.number(),
  round: z.number().int(),
  match_number: z.number().int(),
  player1_id: z.number().nullable(),
  player2_id: z.number().nullable(),
  winner_id: z.number().nullable(),
  pitch_id: z.number().nullable(),
  scheduled_at: z.coerce.date().nullable(),
  completed_at: z.coerce.date().nullable(),
  score_player1: z.number().int().nullable(),
  score_player2: z.number().int().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type TournamentMatch = z.infer<typeof tournamentMatchSchema>;

// Tournament Participant schema
export const tournamentParticipantSchema = z.object({
  id: z.number(),
  tournament_id: z.number(),
  player_id: z.number(),
  registered_at: z.coerce.date(),
  payment_status: z.enum(['pending', 'paid']),
  eliminated_at: z.coerce.date().nullable()
});

export type TournamentParticipant = z.infer<typeof tournamentParticipantSchema>;

// Wallet schema
export const walletSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  balance: z.number(),
  max_negative_balance: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Wallet = z.infer<typeof walletSchema>;

// Wallet Transaction schema
export const walletTransactionSchema = z.object({
  id: z.number(),
  wallet_id: z.number(),
  type: walletTransactionTypeEnum,
  amount: z.number(),
  description: z.string().nullable(),
  reference_id: z.string().nullable(),
  payment_method: paymentMethodEnum.nullable(),
  created_at: z.coerce.date()
});

export type WalletTransaction = z.infer<typeof walletTransactionSchema>;

// Team schema
export const teamSchema = z.object({
  id: z.number(),
  captain_id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  max_players: z.number().int(),
  location: z.string().nullable(),
  preferred_time: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Team = z.infer<typeof teamSchema>;

// Team Member schema
export const teamMemberSchema = z.object({
  id: z.number(),
  team_id: z.number(),
  player_id: z.number(),
  joined_at: z.coerce.date(),
  is_active: z.boolean()
});

export type TeamMember = z.infer<typeof teamMemberSchema>;

// Message schema
export const messageSchema = z.object({
  id: z.number(),
  sender_id: z.number(),
  receiver_id: z.number(),
  type: messageTypeEnum,
  content: z.string(),
  metadata: z.record(z.any()).nullable(),
  read_at: z.coerce.date().nullable(),
  created_at: z.coerce.date()
});

export type Message = z.infer<typeof messageSchema>;

// Invitation schema
export const invitationSchema = z.object({
  id: z.number(),
  sender_id: z.number(),
  receiver_id: z.number(),
  team_id: z.number().nullable(),
  tournament_id: z.number().nullable(),
  type: z.enum(['team_join', 'game_invite']),
  status: invitationStatusEnum,
  message: z.string().nullable(),
  expires_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Invitation = z.infer<typeof invitationSchema>;

// Review schema
export const reviewSchema = z.object({
  id: z.number(),
  player_id: z.number(),
  facility_id: z.number(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Review = z.infer<typeof reviewSchema>;

// Input schemas for creating records
export const createUserInputSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1).max(100),
  phone: z.string().nullable(),
  role: userRoleEnum
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const createFacilityInputSchema = z.object({
  owner_id: z.number(),
  name: z.string().min(1).max(100),
  description: z.string().nullable(),
  address: z.string().min(1),
  city: z.string().min(1),
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  amenities: z.array(z.string()),
  latitude: z.number().nullable(),
  longitude: z.number().nullable()
});

export type CreateFacilityInput = z.infer<typeof createFacilityInputSchema>;

export const createBookingInputSchema = z.object({
  player_id: z.number(),
  pitch_id: z.number(),
  booking_date: z.string().refine((date) => !isNaN(Date.parse(date))),
  start_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  end_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  notes: z.string().nullable()
});

export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;

export const createTournamentInputSchema = z.object({
  organizer_id: z.number(),
  name: z.string().min(1).max(100),
  description: z.string().nullable(),
  bracket_type: bracketTypeEnum,
  entry_fee: z.number().nonnegative(),
  max_participants: z.number().int().min(2),
  registration_start: z.string().refine((date) => !isNaN(Date.parse(date))),
  registration_end: z.string().refine((date) => !isNaN(Date.parse(date))),
  tournament_start: z.string().refine((date) => !isNaN(Date.parse(date))),
  tournament_end: z.string().refine((date) => !isNaN(Date.parse(date))),
  rules: z.string().nullable(),
  prize_pool: z.number().nonnegative().nullable()
});

export type CreateTournamentInput = z.infer<typeof createTournamentInputSchema>;

export const createMessageInputSchema = z.object({
  sender_id: z.number(),
  receiver_id: z.number(),
  type: messageTypeEnum,
  content: z.string().min(1),
  metadata: z.record(z.any()).nullable()
});

export type CreateMessageInput = z.infer<typeof createMessageInputSchema>;

// Update schemas
export const updateBookingStatusInputSchema = z.object({
  booking_id: z.number(),
  status: bookingStatusEnum,
  notes: z.string().nullable()
});

export type UpdateBookingStatusInput = z.infer<typeof updateBookingStatusInputSchema>;

export const updateTournamentStatusInputSchema = z.object({
  tournament_id: z.number(),
  status: tournamentStatusEnum
});

export type UpdateTournamentStatusInput = z.infer<typeof updateTournamentStatusInputSchema>;

// Search and filter schemas
export const searchPitchesInputSchema = z.object({
  date: z.string().refine((date) => !isNaN(Date.parse(date))),
  start_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  end_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  pitch_type: pitchTypeEnum.optional(),
  city: z.string().optional(),
  min_rating: z.number().min(1).max(5).optional(),
  max_price: z.number().positive().optional()
});

export type SearchPitchesInput = z.infer<typeof searchPitchesInputSchema>;

export const searchTeamsInputSchema = z.object({
  location: z.string().optional(),
  preferred_time: z.string().optional(),
  max_distance_km: z.number().positive().optional()
});

export type SearchTeamsInput = z.infer<typeof searchTeamsInputSchema>;