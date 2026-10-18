-- Enforce membership at the database boundary, including concurrent writes.
-- NOT VALID leaves historical mismatches available for manual review while
-- PostgreSQL enforces the relationship for every new insert or update.
ALTER TABLE event_payments
  ADD CONSTRAINT event_payments_participant_fk
  FOREIGN KEY (event_id, person_id)
  REFERENCES event_participants(event_id, person_id)
  NOT VALID;
