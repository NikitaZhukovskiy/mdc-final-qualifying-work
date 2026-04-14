export function UserAvatar() {
  return (
    <svg className="user-avatar-svg" viewBox="0 0 36 36" aria-hidden focusable="false">
      <circle cx="18" cy="18" r="16" className="user-avatar-bg" />
      <path
        className="user-avatar-helmet"
        d="M9.8 16.2c.4-4.8 3.8-8.5 8.2-8.5s7.8 3.7 8.2 8.5h-2.1c-.3-3.6-2.7-6.2-6.1-6.2s-5.8 2.6-6.1 6.2Z"
      />
      <circle cx="18" cy="17.5" r="4.1" className="user-avatar-face" />
      <path
        className="user-avatar-body"
        d="M10.2 28.4c1-3.6 4.2-6.1 7.8-6.1s6.8 2.5 7.8 6.1a13.8 13.8 0 0 1-15.6 0Z"
      />
      <rect x="15.6" y="22.3" width="4.8" height="2.3" rx="0.7" className="user-avatar-jacket" />
    </svg>
  );
}
