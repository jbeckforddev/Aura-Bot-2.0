declare module "yt-search" {
  export type VideoSearchResult = {
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

  type ParsedSearchResult = VideoSearchResult & {
    type?: string;
  };

  type YtSearch = {
    (query: string): Promise<SearchResult>;
    _parseSearchResultInitialData(
      responseText: string,
      callback: (error: unknown, results: ParsedSearchResult[]) => void,
    ): void;
  };

  const yts: YtSearch;
  export default yts;
}