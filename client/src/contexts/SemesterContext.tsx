import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { trpc } from "@/lib/trpc";

type SemesterState = {
  semester: 1 | 2;
  setSemester: (value: 1 | 2) => void;
  academicYear: string;
  currentSemester: 1 | 2;
};

const SemesterContext = createContext<SemesterState>({
  semester: 1,
  setSemester: () => undefined,
  academicYear: "",
  currentSemester: 1,
});

const STORAGE_KEY = "uov-selected-semester";

export function SemesterProvider({ children }: { children: ReactNode }) {
  const academic = trpc.settings.academic.useQuery(undefined, {
    staleTime: 60_000,
  });
  const current = (academic.data?.currentSemester === 2 ? 2 : 1) as 1 | 2;
  const [semester, setSemesterState] = useState<1 | 2 | null>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored === "1" || stored === "2"
        ? (Number(stored) as 1 | 2)
        : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (semester === null && academic.data) setSemesterState(current);
  }, [academic.data, current, semester]);
  const setSemester = (value: 1 | 2) => {
    setSemesterState(value);
    try {
      sessionStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      /* ignore */
    }
  };
  return (
    <SemesterContext.Provider
      value={{
        semester: semester ?? current,
        setSemester,
        academicYear: academic.data?.academicYear || "",
        currentSemester: current,
      }}
    >
      {children}
    </SemesterContext.Provider>
  );
}

export const useSemester = () => useContext(SemesterContext);
