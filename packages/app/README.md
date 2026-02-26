# PropManager - Property Management Dashboard

A modern property management dashboard built with Nuxt 3, Tailwind CSS, GSAP animations, and Strapi authentication.

## Features

- 🏠 **Property Management Dashboard** - Track properties, tenants, payments, and maintenance
- 🔐 **Strapi Authentication** - Secure login/signup with JWT tokens
- 👥 **Role-Based Access** - Different interfaces for Managers and Residents
- 🎨 **Tailwind CSS** - Modern, responsive UI design
- ✨ **GSAP Animations** - Smooth page transitions and entrance animations
- 📊 **Interactive Charts** - Revenue tracking and occupancy analytics
- 🌙 **Theme Switcher** - Light/Dark mode support
- 🌐 **Multi-language** - English and Thai language support
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile

## Prerequisites

- Node.js >= 18.0.0
- Strapi backend running on port 1337

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure Strapi URL (optional):

Create a `.env` file based on `.env.example`:

```bash
NUXT_PUBLIC_STRAPI_URL=http://localhost:1337
```

3. Make sure your Strapi backend is running on port 1337 with authentication enabled.

## Development Server

Start the development server on `http://localhost:3000`:

```bash
npm run dev
```

## Authentication

The app uses Strapi's authentication endpoints:

- **Login**: `POST /api/auth/local`
- **Register**: `POST /api/auth/local/register`

JWT tokens are stored in localStorage and used for protected routes.

### Strapi Role Configuration

The application requires two roles to be configured in your Strapi backend:

- **Role ID 3**: Manager (assigned by default on signup)
- **Role ID 4**: Resident

Make sure these roles exist in your Strapi instance at `Settings > Users & Permissions Plugin > Roles`.

### User Roles

The application supports two user roles:

- **Manager** (Role ID 3): Full property management access with complete dashboard, financial reports, tenant management, and operations tools
- **Resident** (Role ID 4): Limited tenant-focused interface with personal dashboard, lease info, payments, and maintenance requests

**Default Behavior:**
- New users signing up are automatically assigned the Manager role (ID 3)
- User roles are fetched from Strapi on login using the `populate=role` query parameter
- Role mapping: Role ID 3 → Manager, Role ID 4 → Resident

### Switching Roles (Development)

During development, you can switch between roles using the profile menu in the navbar:

1. Click your profile avatar in the top-right corner
2. In the dropdown, use the "Switch Role (Dev)" section
3. Click "Manager" or "Resident" to switch roles
4. The page will reload with the appropriate menu

The selected role persists in localStorage until changed.

**Note:** To properly test role-based features, you should create test users in Strapi with different role assignments (Role ID 3 for managers, Role ID 4 for residents).

## Project Structure

```
app/
├── components/       # Reusable components (Navbar, Sidebar)
├── composables/      # Vue composables (useAuth)
├── layouts/          # Layout templates (default, auth)
├── middleware/       # Route middleware (auth.global.ts)
├── pages/            # Application pages
│   ├── index.vue     # Dashboard
│   ├── signin.vue    # Sign in page
│   └── signup.vue    # Sign up page
└── public/           # Static assets
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
