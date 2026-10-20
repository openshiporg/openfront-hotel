import { AccountAuthPanel } from '../components/account/AccountAuthPanel';
import { AccountDashboard } from '../components/account/AccountDashboard';
import { GuestPortalNav } from '../components/GuestPortalNav';
import { getGuestAccountBookings, getGuestAccountStatus } from '../lib/guest-account';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function param(values: Record<string, string | string[] | undefined>, name: string) {
  const value = values[name];
  return typeof value === 'string' ? value : '';
}

/** Guest accounts: sign in or create one, then see every stay and keep profile details current. */
export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  const values = await searchParams;
  const { account } = await getGuestAccountStatus();
  const stays = account ? await getGuestAccountBookings() : null;
  const notice = param(values, 'passwordChanged') ? 'Your password was changed. Sign in with your new password.'
    : param(values, 'signedOut') ? 'You’re signed out.'
    : param(values, 'reset') ? 'Your password has been reset. Sign in with your new password.'
    : null;

  return <div className="sf-wrap sf-section--tight">
    <header className="sf-stack" style={{ '--stack': '18px', maxWidth: 720 } as React.CSSProperties}>
      <p className="sf-eyebrow">{account ? 'Your account' : 'Guest account'}</p>
      <h1 className="sf-h1">{account ? <>Welcome back, <em>{account.name.split(' ')[0] || account.name}.</em></> : <>A place <em>for your stays.</em></>}</h1>
      <p className="sf-lead">{account ? 'Your stays, statements and details, all in one place.' : 'Sign in to see your stays and book faster, or create an account in a minute.'}</p>
      <GuestPortalNav current="/account" />
    </header>
    {account
      ? <AccountDashboard account={account} stays={stays} />
      : <AccountAuthPanel mode={param(values, 'mode') === 'create' ? 'create' : 'signin'} email={param(values, 'email').slice(0, 254)} next={param(values, 'next') || '/account'} notice={notice} />}
  </div>;
}
