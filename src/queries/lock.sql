
/* @name CreateLock  */
SELECT pg_advisory_xact_lock(hashtext(:lockName!));