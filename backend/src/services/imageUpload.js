const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');

// Photo uploads (team logos, player/user photos) -- Supabase Storage,
// same project already used for Postgres (DATABASE_URL), chosen over
// Cloudinary/S3/R2 for least setup friction: one project, one vendor
// relationship, no new account. Storage needs its own credential though
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) -- separate from
// DATABASE_URL, which is just the raw Postgres connection string and
// doesn't carry Storage API access. Service role key (not anon) because
// uploads only ever happen server-side, already gated by our own
// requireRole/requireTeamAccess checks -- there's no client-side Supabase
// call anywhere, so Supabase's own Row Level Security isn't in the
// picture at all; the service role key bypasses it entirely, which is
// fine precisely because nothing untrusted ever holds this key.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Add them to backend/.env -- '
    + 'Project Settings > API in the Supabase dashboard for the same project DATABASE_URL points at.',
  );
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const BUCKET = 'photos';
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB raw-upload cap -- generous for a phone photo, well under
                                          // reports.js's 20MB (PDFs are a different, larger-file use case).
                                          // The real size-shrinking happens client-side (see
                                          // src/utils/resizeImage.js) before the file is ever sent.
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Never trust the client's declared Content-Type alone for anything that
// reaches disk/storage -- multer's fileFilter runs on the browser-reported
// mimetype, which is attacker-controllable. Cheap enough to also check the
// first few bytes' real file signature before upload, same "don't trust
// the client" posture already used for accent_override's hex validation.
const MAGIC_BYTES = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // 'RIFF' -- WebP's real marker ('WEBP') sits at byte 8,
                                            // but the RIFF prefix alone is enough to reject anything
                                            // that isn't even a RIFF container.
};

function matchesDeclaredType(buffer, mimeType) {
  const signature = MAGIC_BYTES[mimeType];
  if (!signature) return false;
  return signature.every((byte, i) => buffer[i] === byte);
}

// multer instance shared by every upload route (team logo, player photo,
// user photo) -- memoryStorage, not diskStorage: the buffer goes straight
// to Supabase Storage and never touches local disk, unlike the existing
// PDF-report pipeline (reports.js/bulkImport.js), which correctly uses
// diskStorage because those files are parsed once and only their
// extracted data persists. Photos need to persist indefinitely as public
// URLs, so local disk (ephemeral on most Node hosts) was never viable --
// see the investigation report this implements.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WebP images are allowed'));
    }
    cb(null, true);
  },
});

// One public bucket, prefixed by entity type -- team-logos/, player-photos/,
// user-photos/ -- rather than three separate buckets. Simpler to provision
// and reason about for a feature this size; the prefix alone is enough
// organization. Public read (not signed URLs) because these are displayed
// as plain <img> tags to any logged-in user, same as logo_url already is
// today -- write access is what's actually gated, via our own
// requireRole/requireTeamAccess on the upload routes, never via Supabase
// Storage policies (the service role key bypasses those entirely).
async function ensureBucketExists() {
  const { data: existing, error: getError } = await supabase.storage.getBucket(BUCKET);
  if (existing) return;
  // getBucket errors (rather than returning null) when the bucket is
  // missing -- only proceed to create on that specific case, not swallow
  // some other real failure (e.g. a bad key) into a confusing create-retry.
  if (getError && !/not.*found/i.test(getError.message || '')) {
    throw new Error(`Could not check Supabase Storage bucket '${BUCKET}': ${getError.message}`);
  }
  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_FILE_BYTES,
  });
  if (createError && !/already exists/i.test(createError.message || '')) {
    throw new Error(`Could not create Supabase Storage bucket '${BUCKET}': ${createError.message}`);
  }
}

// Uploads + returns the public URL in one call. Each upload gets a unique,
// timestamped path rather than overwriting the previous file in place --
// avoids CDN/browser cache staleness on replacement (a new URL is always
// a cache miss) at the cost of leaving old files behind on re-upload.
// Acceptable tradeoff at this app's scale (team logos + roster/user
// headshots, not a high-churn media product); deleting the previous file
// on replace would need to be done carefully to avoid a race against a
// still-in-flight request for the old URL, not worth the complexity here.
async function uploadImage({ entityType, entityId, buffer, mimeType }) {
  if (!matchesDeclaredType(buffer, mimeType)) {
    throw new Error('File content does not match its declared image type');
  }
  const ext = EXT_BY_MIME[mimeType] || 'jpg';
  const path = `${entityType}/${entityId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

module.exports = { imageUpload, uploadImage, ensureBucketExists, BUCKET, ALLOWED_MIME_TYPES, MAX_FILE_BYTES };
