import { SideMenuGroup } from '../../../shared';

export const FULL_NAV: SideMenuGroup[] = [
  {
    items: [
      { title: 'Home', icon: 'home.svg', id: 'home' },
      { title: 'Balances', icon: 'account_balance.svg', id: 'balance' },
      { title: 'Transactions', icon: 'autorenew.svg', id: 'payments' },
      { title: 'Customers', icon: 'person.svg', id: 'customers' },
      { title: 'Product Catalog', icon: 'package.svg', id: 'products' },
      { title: 'Payment Links', icon: 'sell.svg', id: 'payment-links' },
    ],
  },
  {
    label: 'Connect',
    items: [
      { title: 'Accounts', icon: 'groups.svg', id: 'connected-accounts' },
    ],
  },
  {
    label: 'Developers',
    items: [{ title: 'Developers', icon: 'code.svg', id: 'developers' }],
  },
  {
    items: [
      { title: 'Settings', icon: 'settings.svg', id: 'settings', bottom: true },
    ],
  },
];
