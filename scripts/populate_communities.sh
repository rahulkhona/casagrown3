#!/bin/bash

# Configuration
URL="http://127.0.0.1:54321/functions/v1/scrape-communities"
BATCH_SIZE=10
TOTAL_ZIPS=33099
MAX_BATCHES=$(( (TOTAL_ZIPS + BATCH_SIZE - 1) / BATCH_SIZE )) # (33099 / 10) -> ~3310
DELAY=0.5 # Slightly faster delay since batches are smaller

echo "Starting full community population..."
echo "Total batches to process: $MAX_BATCHES (Batch Size: $BATCH_SIZE)"

for i in $(seq 1 $MAX_BATCHES); do
  echo "Processing batch $i of $MAX_BATCHES..."
  
  RESPONSE=$(curl -s -X POST "$URL" \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
    -H "Content-Type: application/json" \
    -d "{\"limit\": $BATCH_SIZE}")
  
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
