import argparse
import json
import os
from tqdm import tqdm
from scraper import WikiScraper
from processor import DataProcessor

def main():
    parser = argparse.ArgumentParser(description="Wikipedia Scraper & Dataset Generator")
    parser.add_argument("--query", type=str, required=True, help="Search query for Wikipedia")
    parser.add_argument("--max-pages", type=int, default=3, help="Maximum number of pages to scrape")
    parser.add_argument("--output", type=str, default="dataset.jsonl", help="Output JSONL file path")
    
    args = parser.parse_args()
    
    print(f"Initializing Scraper and Processor...")
    scraper = WikiScraper()
    try:
        processor = DataProcessor()
    except ValueError as e:
        print(f"Error: {e}")
        print("Please set your DEEPSEEK_API_KEY in the .env file.")
        return

    # 1. Search
    print(f"Searching for '{args.query}'...")
    pages = scraper.search_pages(args.query, limit=args.max_pages)
    print(f"Found {len(pages)} pages: {pages}")
    
    all_data = []
    
    # 2. Scrape & Process
    for page_title in tqdm(pages, desc="Processing Pages"):
        content = scraper.get_page_content(page_title)
        if not content:
            print(f"Skipping '{page_title}' (no content).")
            continue
            
        # Chunking strategy: Simple split by paragraphs or length to avoid massive context
        # For simplicity, we'll take the first 5000 chars or split by double newlines
        # Let's do a simple chunking: chunks of ~2000 chars
        chunks = [content[i:i+4000] for i in range(0, len(content), 4000)]
        
        # Limit chunks per page to avoid excessive API usage in this demo
        chunks = chunks[:3] 
        
        for i, chunk in enumerate(chunks):
            if len(chunk) < 500: # Skip small chunks
                continue
                
            pairs = processor.generate_training_data(chunk, page_title)
            all_data.extend(pairs)
            
    # 3. Save
    print(f"Saving {len(all_data)} pairs to {args.output}...")
    with open(args.output, 'w', encoding='utf-8') as f:
        for item in all_data:
            f.write(json.dumps(item) + '\n')
            
    print("Done!")

if __name__ == "__main__":
    main()
