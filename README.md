# 💰 Expense Tracker

A modern, full-stack expense tracking application built with Next.js 15, tRPC, and PostgreSQL. Track your expenses, manage shared costs with friends, and gain insights into your spending patterns with beautiful analytics.
  
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![tRPC](https://img.shields.io/badge/tRPC-11-2596be?style=flat-square&logo=trpc)](https://trpc.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

## ✨ Features

- **💳 Multi-Account Management** - Track expenses across multiple bank accounts
- **👥 Shared Expenses** - Split costs with friends and track who owes what
- **📊 Analytics Dashboard** - Visualize spending patterns with interactive charts
- **🔄 Self Transfers** - Record transfers between your own accounts
- **📝 Transaction Sessions** - Organize expenses into sessions for better tracking
- **🎨 Modern UI** - Beautiful, responsive interface with dark/light theme support
- **🔐 Secure Authentication** - Email/password authentication with session management
- **⚡ Real-time Updates** - Optimistic updates with TanStack Query
- **📱 Mobile Responsive** - Works seamlessly on desktop, tablet, and mobile devices
- **🔍 Advanced Filtering** - Filter and search transactions with URL-persisted state

## 🚀 Tech Stack

### Frontend
- **[Next.js 15](https://nextjs.org/)** - React framework with App Router
- **[React 19](https://react.dev/)** - UI library
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety
- **[TailwindCSS](https://tailwindcss.com/)** - Utility-first styling
- **[shadcn/ui](https://ui.shadcn.com/)** - Re-usable component library
- **[Radix UI](https://www.radix-ui.com/)** - Accessible UI primitives
- **[Lucide Icons](https://lucide.dev/)** - Beautiful icon set
- **[Recharts](https://recharts.org/)** - Charts and data visualization

### Backend
- **[tRPC](https://trpc.io/)** - End-to-end typesafe APIs
- **[Drizzle ORM](https://orm.drizzle.team/)** - TypeScript ORM
- **[PostgreSQL](https://www.postgresql.org/)** - Relational database
- **[better-auth](https://www.better-auth.com/)** - Authentication solution

### State Management & Forms
- **[TanStack Query](https://tanstack.com/query)** - Server state management
- **[React Hook Form](https://react-hook-form.com/)** - Form handling
- **[Zod](https://zod.dev/)** - Schema validation
- **[nuqs](https://nuqs.47ng.com/)** - URL state management

### Developer Experience
- **[ESLint](https://eslint.org/)** - Code linting with security plugins
- **[Prettier](https://prettier.io/)** - Code formatting
- **[TypeScript](https://www.typescriptlang.org/)** - Static type checking
- **[Docker](https://www.docker.com/)** - Containerization

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 20.x or higher
- **pnpm** 8.x or higher (recommended) or npm/yarn
- **PostgreSQL** 14.x or higher
- **Git**

## 🛠️ Installation

### 1. Clone the repository

```bash
git clone https://github.com/jainhardik120/expense-tracker.git
cd expense-tracker
```

### 2. Install dependencies

```bash
pnpm install
# or
npm install
# or
yarn install
```

### 3. Set up environment variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/expense_tracker"

# App URL (optional)
NEXT_PUBLIC_BASE_URL="http://localhost:3000"

# Skip environment validation during build (optional)
SKIP_ENV_VALIDATION=false
```

### 4. Set up the database

Generate and run database migrations:

```bash
# Generate migration files
pnpm db:generate

# Apply migrations to database
pnpm db:migrate
```

### 5. Start the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## 🗄️ Database Schema

The application uses a multi-tenant architecture where all data is scoped by `userId`. Key entities include:

- **users** - User accounts and profiles
- **sessions** - Authentication sessions
- **bankAccount** - User's financial accounts
- **statements** - All transactions (expenses, transfers, etc.)
- **friendsProfiles** - People involved in shared expenses
- **splits** - How expenses are divided among friends
- **selfTransferStatements** - Transfers between user's own accounts

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication routes (login/register)
│   ├── (main)/            # Protected app routes
│   │   ├── sessions/      # Expense tracking sessions
│   │   ├── statements/    # Transaction management
│   │   └── aggregated/    # Analytics and summaries
│   └── api/               # API routes
├── components/            # Reusable React components
│   ├── ui/               # shadcn/ui components
│   └── data-table/       # Table components with filtering
├── server/               # Backend logic
│   ├── routers/          # tRPC routers
│   └── helpers/          # Helper functions
├── db/                   # Database configuration
│   └── schema.ts         # Drizzle schema definitions
├── lib/                  # Utility functions and configurations
└── hooks/                # Custom React hooks
```

## 🎯 Available Scripts

```bash
# Development
pnpm dev              # Start development server with Turbopack
pnpm build            # Build for production
pnpm start            # Start production server

# Database
pnpm db:generate      # Generate migration files
pnpm db:migrate       # Run database migrations

# Code Quality
pnpm lint             # Run ESLint
pnpm lint:fix         # Fix ESLint errors
pnpm typecheck        # Run TypeScript type checking
pnpm format           # Format code with Prettier

# Analysis
pnpm duplicate:check  # Check for code duplication
pnpm update:check     # Check for dependency updates
```

## 🐳 Docker Deployment

Build and run with Docker:

```bash
# Build the Docker image
docker build -t expense-tracker .

# Run the container
docker run -p 3000:3000 \
  -e DATABASE_URL="your_database_url" \
  expense-tracker
```

## 🌐 Deployment

### Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/jainhardik120/expense-tracker)

1. Push your code to GitHub
2. Import your repository to Vercel
3. Add environment variables
4. Deploy!

### Other Platforms

The application can be deployed to any platform that supports Node.js and Docker:
- **Railway**
- **Render**
- **Fly.io**
- **AWS/GCP/Azure**

Ensure you:
1. Set up a PostgreSQL database
2. Configure environment variables
3. Run database migrations
4. Deploy the application

## 🤖 Android Release Automation

The Android GitHub Actions workflow at `.github/workflows/main.yml` now publishes the release `.aab` to the Google Play `internal` track as part of the `master` release pipeline. A separate `release` trigger remains as a fallback for manually published GitHub releases.

Before that release job can succeed:

1. Enable the Google Play Android Developer API for the Google Cloud project tied to your Play Console account.
2. Create a service account key in JSON format.
3. Add that service account under Google Play Console `Users and permissions` and grant it access to `com.jainhardik120.expensetracker`.
4. Add the JSON file contents to the repository GitHub secret `PLAYSTORE_SERVICE_ACCOUNT_JSON`.
5. Make sure the app already exists in Play Console and has had its first upload created manually.

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Run `pnpm lint` and `pnpm typecheck` before committing
- Write meaningful commit messages
- Update documentation as needed

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - The React Framework
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [tRPC](https://trpc.io/) - End-to-end typesafe APIs
- [Drizzle ORM](https://orm.drizzle.team/) - TypeScript ORM

## 📧 Contact

For questions or feedback, please open an issue on GitHub.

---

Built with ❤️ using Next.js 15
