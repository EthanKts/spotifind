import type { Metadata } from "next";
import { GenresView } from "./GenresView";

export const metadata: Metadata = { title: "Genres" };

export default function Page() {
  return <GenresView />;
}
