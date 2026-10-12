-- A seven-day trial is exactly 168 elapsed hours even across local DST changes.
ALTER TABLE "Trial" DROP CONSTRAINT "Trial_dates_check";
ALTER TABLE "Trial" ADD CONSTRAINT "Trial_dates_check"
CHECK (extract(epoch FROM ("expiresAt" - "startsAt")) = 604800);
