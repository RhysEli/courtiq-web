import { useRef, useState } from 'react';
import { Alert, Avatar, Box, CircularProgress, IconButton, Stack } from '@mui/material';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import { resizeImageFile } from '../utils/resizeImage';

// Shared upload control for team logos and player/user photos -- resize,
// preview, upload, error handling in one place rather than duplicating it
// across team-brand-settings.jsx, players-management.jsx, and users.jsx.
// Purely a controlled preview: `value` is the current saved URL (or
// null/undefined), `onUpload(blob)` does the actual backendApi call and
// should throw on failure -- this component doesn't know about teams,
// players, or users at all, just "a photo that can be replaced".
//
// Deliberately NOT accent-colored -- unlike the personal-preference UI
// elsewhere in this app, none of this component's three real use cases
// (a team's own logo, a staff member uploading a PLAYER's photo, a staff
// member uploading ANOTHER user's photo) are the logged-in user's own
// personal preference, so var(--user-accent) doesn't belong here. Plain
// MUI default styling, same as the rest of the team-editing pages this
// also appears on.
function PhotoUpload({ value, onUpload, size = 96, shape = 'circle', fallback, disabled }) {
  // Scales with `size` (clamped) rather than a fixed 28px -- at small
  // sizes (e.g. a 40px roster-row thumbnail) a fixed-size button ends up
  // nearly as big as the avatar itself and swamps it.
  const buttonSize = Math.round(Math.min(28, Math.max(16, size * 0.42)));
  const iconSize = Math.round(buttonSize * 0.58);

  const inputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const pickFile = () => inputRef.current?.click();

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the exact same file again next time
    if (!file) return;

    setError('');
    setUploading(true);
    let localUrl = null;
    try {
      const resized = await resizeImageFile(file);
      localUrl = URL.createObjectURL(resized);
      setPreviewUrl(localUrl);
      await onUpload(resized);
    } catch (err) {
      setError(err.message || 'Could not upload photo.');
      setPreviewUrl(null);
    } finally {
      setUploading(false);
      if (localUrl) URL.revokeObjectURL(localUrl);
    }
  };

  const displayUrl = previewUrl || value || undefined;

  return (
    <Stack direction="row" alignItems="center" spacing={2}>
      <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <Avatar
          src={displayUrl}
          variant={shape === 'square' ? 'rounded' : 'circular'}
          sx={{ width: size, height: size, fontSize: size * 0.4, fontWeight: 700 }}
        >
          {!displayUrl ? fallback : null}
        </Avatar>
        {uploading && (
          <Box
            sx={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'rgba(0,0,0,0.45)', borderRadius: shape === 'square' ? 1.5 : '50%',
            }}
          >
            <CircularProgress size={size * 0.3} sx={{ color: '#fff' }} />
          </Box>
        )}
        <IconButton
          size="small"
          onClick={pickFile}
          disabled={disabled || uploading}
          sx={{
            position: 'absolute', bottom: -2, right: -2, width: buttonSize, height: buttonSize,
            bgcolor: 'background.paper', border: '1px solid rgba(148,163,184,0.4)',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <PhotoCameraRoundedIcon sx={{ fontSize: iconSize }} />
        </IconButton>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleFileChange} />
      </Box>
      {error && <Alert severity="error" sx={{ py: 0, flex: 1 }}>{error}</Alert>}
    </Stack>
  );
}

export default PhotoUpload;
