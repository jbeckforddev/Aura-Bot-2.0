declare module "yt-search" {
  type VideoSearchResult = {
    videoId: string;
    title: string;
    url: string;
    author?: { name?: string };
    timestamp?: string;
    duration?: { timestamp?: string };
    views?: number;
    thumbnail?: string;
  };

  type SearchResult = {
    videos?: VideoSearchResult[];
  };

  export default function yts(query: string): Promise<SearchResult>;
}