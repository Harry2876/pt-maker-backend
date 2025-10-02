-- CreateIndex
CREATE INDEX "groups_tournamentId_idx" ON "public"."groups"("tournamentId");

-- CreateIndex
CREATE INDEX "groups_stageId_idx" ON "public"."groups"("stageId");

-- CreateIndex
CREATE INDEX "groups_tournamentId_createdAt_idx" ON "public"."groups"("tournamentId", "createdAt");

-- CreateIndex
CREATE INDEX "match_results_teamRegistrationId_createdAt_idx" ON "public"."match_results"("teamRegistrationId", "createdAt");

-- CreateIndex
CREATE INDEX "match_results_matchId_position_idx" ON "public"."match_results"("matchId", "position");

-- CreateIndex
CREATE INDEX "match_results_teamRegistrationId_totalMatchPoints_idx" ON "public"."match_results"("teamRegistrationId", "totalMatchPoints" DESC);

-- CreateIndex
CREATE INDEX "match_results_matchId_totalKills_idx" ON "public"."match_results"("matchId", "totalKills" DESC);

-- CreateIndex
CREATE INDEX "match_results_createdAt_idx" ON "public"."match_results"("createdAt");

-- CreateIndex
CREATE INDEX "matches_tournamentId_matchNumber_idx" ON "public"."matches"("tournamentId", "matchNumber");

-- CreateIndex
CREATE INDEX "matches_groupId_matchNumber_idx" ON "public"."matches"("groupId", "matchNumber");

-- CreateIndex
CREATE INDEX "matches_status_createdAt_idx" ON "public"."matches"("status", "createdAt");

-- CreateIndex
CREATE INDEX "matches_tournamentId_status_idx" ON "public"."matches"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "matches_resultStatus_idx" ON "public"."matches"("resultStatus");

-- CreateIndex
CREATE INDEX "slot_assignments_groupId_isActive_idx" ON "public"."slot_assignments"("groupId", "isActive");

-- CreateIndex
CREATE INDEX "slot_assignments_teamRegistrationId_idx" ON "public"."slot_assignments"("teamRegistrationId");

-- CreateIndex
CREATE INDEX "slot_assignments_groupId_slotNumber_idx" ON "public"."slot_assignments"("groupId", "slotNumber");

-- CreateIndex
CREATE INDEX "team_registrations_tournamentId_totalPoints_idx" ON "public"."team_registrations"("tournamentId", "totalPoints" DESC);

-- CreateIndex
CREATE INDEX "team_registrations_groupId_totalPoints_idx" ON "public"."team_registrations"("groupId", "totalPoints" DESC);

-- CreateIndex
CREATE INDEX "team_registrations_tournamentId_createdAt_idx" ON "public"."team_registrations"("tournamentId", "createdAt");

-- CreateIndex
CREATE INDEX "team_registrations_tournamentId_registrationStatus_idx" ON "public"."team_registrations"("tournamentId", "registrationStatus");

-- CreateIndex
CREATE INDEX "team_registrations_teamName_idx" ON "public"."team_registrations"("teamName");

-- CreateIndex
CREATE INDEX "team_registrations_totalPoints_createdAt_idx" ON "public"."team_registrations"("totalPoints" DESC, "createdAt");

-- CreateIndex
CREATE INDEX "team_registrations_currentStage_totalPoints_idx" ON "public"."team_registrations"("currentStage", "totalPoints" DESC);

-- CreateIndex
CREATE INDEX "tournaments_userId_status_idx" ON "public"."tournaments"("userId", "status");

-- CreateIndex
CREATE INDEX "tournaments_userId_createdAt_idx" ON "public"."tournaments"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "tournaments_status_createdAt_idx" ON "public"."tournaments"("status", "createdAt");

-- CreateIndex
CREATE INDEX "tournaments_game_status_idx" ON "public"."tournaments"("game", "status");

-- CreateIndex
CREATE INDEX "tournaments_name_idx" ON "public"."tournaments"("name");
