import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import AppShell from "./components/app/AppShell";
import { useAuth } from "./_core/hooks/useAuth";
import { SemesterProvider } from "./contexts/SemesterContext";
import { ChangePasswordPage, LoginPage } from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import TimetablePage from "./pages/Timetable";
import AnalyticsPage from "./pages/Analytics";
import GeneratePage from "./pages/Generate";
import CoursesPage, { CourseDetailPage } from "./pages/Courses";
import AssignmentsPage from "./pages/Assignments";
import ImportPage from "./pages/Import";
import { LecturersPage, RoomsPage, StudentsPage } from "./pages/People";
import { RequestsPage, SessionsPage } from "./pages/Operations";
import {
  NoticesPage,
  ProfileApprovalsPage,
  ProfilePage,
  SettingsPage,
} from "./pages/System";
import NotFound from "./pages/NotFound";

type Role = "admin" | "lecturer" | "student";
const only = (roles: Role[], role: Role, Page: () => React.ReactElement) =>
  roles.includes(role) ? Page : NotFound;

function Router({ role }: { role: Role }) {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/timetable" component={TimetablePage} />
      <Route path="/courses/:id" component={CourseDetailPage} />
      <Route path="/courses" component={CoursesPage} />
      <Route path="/notices" component={NoticesPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/change-password" component={() => <ChangePasswordPage />} />
      <Route
        path="/sessions"
        component={only(["admin", "lecturer"], role, SessionsPage)}
      />
      <Route
        path="/requests"
        component={only(["admin", "lecturer"], role, RequestsPage)}
      />
      <Route
        path="/rooms"
        component={only(["admin", "lecturer"], role, RoomsPage)}
      />
      <Route
        path="/analytics"
        component={only(["admin"], role, AnalyticsPage)}
      />
      <Route path="/generate" component={only(["admin"], role, GeneratePage)} />
      <Route
        path="/assignments"
        component={only(["admin"], role, AssignmentsPage)}
      />
      <Route
        path="/lecturers"
        component={only(["admin"], role, LecturersPage)}
      />
      <Route path="/students" component={only(["admin"], role, StudentsPage)} />
      <Route path="/import" component={only(["admin"], role, ImportPage)} />
      <Route path="/settings" component={only(["admin"], role, SettingsPage)} />
      <Route
        path="/profile-approvals"
        component={only(["admin"], role, ProfileApprovalsPage)}
      />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <Toaster position="top-right" richColors closeButton />
        {loading ? (
          <div className="flex min-h-screen items-center justify-center gap-3 bg-sidebar text-sm text-white/80">
            <Loader2 className="animate-spin" size={18} /> Loading secure
            workspace…
          </div>
        ) : !user ? (
          <LoginPage />
        ) : user.mustChangePassword && !user.hasPassword ? (
          <ChangePasswordPage forceSetup />
        ) : (
          <SemesterProvider>
            <AppShell>
              <Router role={user.role as Role} />
            </AppShell>
          </SemesterProvider>
        )}
      </TooltipProvider>
    </ErrorBoundary>
  );
}
