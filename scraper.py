import wikipediaapi
from typing import List, Optional

class WikiScraper:
    def __init__(self, user_agent: str = "WikiScraper/1.0 (contact@example.com)"):
        self.user_agent = user_agent
        self.wiki = wikipediaapi.Wikipedia(
            user_agent=user_agent,
            language='en',
            extract_format=wikipediaapi.ExtractFormat.WIKI
        )

    def search_pages(self, query: str, limit: int = 5) -> List[str]:
        """
        Search for pages matching the query.
        Note: wikipedia-api doesn't have a direct search method that returns a list of titles 
        in the same way as the 'wikipedia' library. 
        We might need to use a category or just try to get the page directly if the query is exact.
        However, for a broader search, we can use the underlying API or a different approach.
        
        Let's try a simpler approach: Since wikipedia-api is strict, we might want to use the standard 'wikipedia' library 
        for search if 'wikipedia-api' is too restrictive, or just accept that we need exact titles.
        
        Wait, I'll implement a helper using the requests library to the MediaWiki API for search if needed, 
        but let's see if we can just use the page existence check for now or if I should switch to 'wikipedia' lib for search.
        
        Actually, let's stick to the plan but maybe use the 'wikipedia' library for search if 'wikipedia-api' is too limited.
        The 'wikipedia' library is easier for search. 
        
        Let's check requirements.txt... I put 'wikipedia-api'. 
        I'll add a simple search function using requests if needed, or just assume the user provides a valid topic 
        and we traverse links. 
        
        Actually, let's just use the 'wikipedia' library for search as it's easier, or just use requests.
        I'll stick to 'wikipedia-api' for content as it's cleaner, and use a custom request for search.
        """
        # Simple search implementation using requests to MediaWiki API
        import requests
        
        url = "https://en.wikipedia.org/w/api.php"
        params = {
            "action": "query",
            "format": "json",
            "list": "search",
            "srsearch": query,
            "srlimit": limit
        }
        
        headers = {
            "User-Agent": self.user_agent
        }
        
        try:
            response = requests.get(url, params=params, headers=headers)
            response.raise_for_status()
            data = response.json()
            search_results = data.get("query", {}).get("search", [])
            return [result["title"] for result in search_results]
        except Exception as e:
            print(f"Error searching Wikipedia: {e}")
            return []

    def get_page_content(self, title: str) -> Optional[str]:
        """
        Get the text content of a page.
        """
        page = self.wiki.page(title)
        if page.exists():
            return page.text
        return None
