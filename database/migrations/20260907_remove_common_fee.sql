-- Run through scripts/remove-common-fee.mjs: backup first, transaction retained.
-- The requested change recalculates historical totals without deleting invoices.
ALTER TABLE invoices DROP COLUMN total_amount;
ALTER TABLE invoices DROP COLUMN IF EXISTS common_fee;
ALTER TABLE utility_rates DROP COLUMN IF EXISTS common_fee;
ALTER TABLE invoices ADD COLUMN total_amount numeric(10,2)
 GENERATED ALWAYS AS (rent_amount + water_amount + electric_amount) STORED;
