-- Legacy Discord / enrollment tables removed from product; DB already dropped manually.
-- Formalize so migration history matches Neon.

DROP TABLE IF EXISTS "discord_registration_queue" CASCADE;
DROP TABLE IF EXISTS "discord_registration_sessions" CASCADE;
DROP TABLE IF EXISTS "discord_team_merit" CASCADE;
DROP TABLE IF EXISTS "discord_registration_delays" CASCADE;
DROP TABLE IF EXISTS "discord_registration_toggles" CASCADE;
DROP TABLE IF EXISTS "discord_team_bans" CASCADE;
DROP TABLE IF EXISTS "team_activity_logs" CASCADE;
DROP TABLE IF EXISTS "team_name_changes" CASCADE;
DROP TABLE IF EXISTS "user_rate_limits" CASCADE;
DROP TABLE IF EXISTS "team_enrollments" CASCADE;
DROP TABLE IF EXISTS "bot_states" CASCADE;
DROP TABLE IF EXISTS "discord_scrims" CASCADE;
DROP TABLE IF EXISTS "discord_guild_members" CASCADE;
DROP TABLE IF EXISTS "discord_guilds" CASCADE;
DROP TABLE IF EXISTS "discord_users" CASCADE;

DROP TYPE IF EXISTS "DelayType";
DROP TYPE IF EXISTS "MeritAction";
DROP TYPE IF EXISTS "PunishmentType";
DROP TYPE IF EXISTS "QueueStatus";
DROP TYPE IF EXISTS "RegistrationStatus";