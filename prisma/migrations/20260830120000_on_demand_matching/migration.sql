-- Compatibility is calculated from current profile data on every request.
DROP TABLE "match_algorithm_scores";
DROP TABLE "match_results";
DROP TABLE "match_runs";
DROP TYPE "MatchRunStatus";

ALTER TABLE "housing_preferences"
ADD COLUMN "preferred_roommate_genders" "Gender"[] NOT NULL
DEFAULT ARRAY[
  'WOMAN'::"Gender",
  'MAN'::"Gender",
  'NON_BINARY'::"Gender",
  'OTHER'::"Gender",
  'PREFER_NOT_TO_SAY'::"Gender"
];

DROP INDEX "housing_preferences_city_max_monthly_budget_idx";
CREATE INDEX "housing_preferences_country_code_city_currency_min_monthly_budget_max_monthly_budget_idx"
ON "housing_preferences"(
  "country_code",
  "city",
  "currency",
  "min_monthly_budget",
  "max_monthly_budget"
);

CREATE INDEX "users_is_discoverable_onboarding_complete_gender_idx"
ON "users"("is_discoverable", "onboarding_complete", "gender");

CREATE INDEX "housing_preferences_preferred_roommate_genders_idx"
ON "housing_preferences" USING GIN("preferred_roommate_genders");
