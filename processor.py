import os
from openai import OpenAI
import json
from typing import List, Dict, Any
from dotenv import load_dotenv

load_dotenv()

class DataProcessor:
    def __init__(self):
        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            raise ValueError("DEEPSEEK_API_KEY not found in environment variables.")
        
        # DeepSeek API configuration
        self.client = OpenAI(
            api_key=api_key, 
            base_url="https://api.deepseek.com"
        )

    def generate_training_data(self, text_chunk: str, topic: str) -> List[Dict[str, str]]:
        """
        Generates Q&A/Instruction pairs from the given text chunk using DeepSeek.
        """
        prompt = f"""
        You are an expert at creating high-quality training data for Large Language Models.
        
        Context: The following text is from a Wikipedia article about "{topic}".
        
        Task: Generate 3 to 5 high-quality instruction-response pairs based *only* on the provided text.
        The instruction should be a question or a request for information that can be answered by the text.
        The response should be a clear, accurate, and concise answer derived from the text.
        
        Format: Return the output as a valid JSON array of objects. Each object must have "instruction" and "response" keys.
        Do not include any markdown formatting or explanations, just the raw JSON.
        
        Text:
        {text_chunk[:10000]}
        
        JSON Output:
        """
        
        try:
            response = self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that outputs strictly JSON."},
                    {"role": "user", "content": prompt}
                ],
                response_format={ "type": "json_object" }
            )
            
            text_response = response.choices[0].message.content.strip()
            
            # Clean up if necessary (though json_object mode should be clean)
            if text_response.startswith("```json"):
                text_response = text_response[7:]
            if text_response.startswith("```"):
                text_response = text_response[3:]
            if text_response.endswith("```"):
                text_response = text_response[:-3]
                
            data = json.loads(text_response)
            
            # DeepSeek might return { "pairs": [...] } or just [...] depending on how it interprets "JSON array" with json_object mode
            if isinstance(data, list):
                return data
            elif isinstance(data, dict):
                # Check for common keys
                if "pairs" in data: return data["pairs"]
                if "data" in data: return data["data"]
                if "instruction_response_pairs" in data: return data["instruction_response_pairs"]
                # If it's a single object that looks like a pair, wrap it
                if "instruction" in data and "response" in data: return [data]
                
                # Fallback: try to find any list in the values
                for v in data.values():
                    if isinstance(v, list):
                        return v
            
            print("Unexpected JSON format from LLM.")
            return []
                
        except Exception as e:
            print(f"Error generating data with LLM: {e}")
            return []
