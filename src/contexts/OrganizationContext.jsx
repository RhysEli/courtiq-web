import { createContext, useContext, useMemo, useState } from 'react';
import { getOrganizations, getUsers, getInvites, getAccessRequests } from '../services/accountService';

const OrganizationContext = createContext(null);

export function OrganizationProvider({ children }) {
  const [organizations, setOrganizations] = useState(() => getOrganizations());
  const [users, setUsers] = useState(() => getUsers());
  const [invites, setInvites] = useState(() => getInvites());
  const [requests, setRequests] = useState(() => getAccessRequests());

  const value = useMemo(
    () => ({
      organizations,
      setOrganizations,
      users,
      setUsers,
      invites,
      setInvites,
      requests,
      setRequests,
    }),
    [organizations, users, invites, requests],
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}
