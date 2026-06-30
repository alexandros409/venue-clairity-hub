
ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS delay_minutes numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS affected_covers numeric NOT NULL DEFAULT 4;

UPDATE public.audits
SET actionable_steps =
  '1. Καταγράψτε αναλυτικά τα βήματα και τις συμπεριφορές της ομάδας που οδήγησαν στο θετικό αποτέλεσμα, ώστε να αποτυπωθούν ως πρότυπο καλής πρακτικής.'
  || E'\n' ||
  '2. Επιβραβεύστε δημόσια τα μέλη της ομάδας που συνέβαλαν σε αυτή την εμπειρία, στο επόμενο pre-shift briefing.'
  || E'\n' ||
  '3. Χρησιμοποιήστε την παρατήρηση ως εκπαιδευτικό case study στην επόμενη εσωτερική συνάντηση της ομάδας FOH.'
WHERE is_positive = true
  AND (actionable_steps IS NULL OR actionable_steps NOT ILIKE '%καταγράψτε%');
