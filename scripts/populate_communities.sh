#!/bin/bash

# Configuration
URL="http://127.0.0.1:54321/functions/v1/scrape-communities"
MAX_BATCHES=663 # (33099 / 50) + 1
DELAY=2 # Seconds between batches to be polite to NCES

echo "Starting full community population..."
echo "Total batches to process: $MAX_BATCHES"

for i in $(seq 1 $MAX_BATCHES); do
  echo "Processing batch $i of $MAX_BATCHES..."
  
  RESPONSE=$(curl -s -X POST "$URL" \
    -H "Authorization: Bearer mock_key" \
    -H "Content-Type: application/json")
  
  # Check if response has success:true
  SUCCESS=$(echo $RESPONSE | grep -o '"success":true')
  
  if [ -n "$SUCCESS" ]; then
    ZIPS=$(echo $RESPONSE | grep -o '"zips_processed":[0-9]*' | cut -d: -f2)
    FOUND=$(echo $RESPONSE | grep -o '"communities_found":[0-9]*' | cut -d: -f2)
    echo "  Success: Processed $ZIPS zip codes, found $FOUND communities."
    
    # If ZIPS is 0, we might be done
    if [ "$ZIPS" -eq 0 ]; then
      echo "No more zip codes to process. Population complete!"
      break
    fi
  else
    echo "  Error: Batch $i failed. Response: $RESPONSE"
    echo "  Waiting 10 seconds before retry..."
    sleep 10
  fi

  sleep $DELAY
done

echo "Community population finished."
