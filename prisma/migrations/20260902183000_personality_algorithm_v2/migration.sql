-- Keep result metadata aligned with the trait-dependent personality scorer.
UPDATE "algorithm_configs"
SET "version" = '2.0.0', "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'PERSONALITY' AND "version" = '1.0.0';
