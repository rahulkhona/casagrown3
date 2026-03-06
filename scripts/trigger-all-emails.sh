#!/bin/bash
# Trigger all notification email types to Mailpit via the edge function
# Usage: bash scripts/trigger-all-emails.sh
#
# Prerequisites:
#   1. supabase is running (npx supabase start)
#   2. functions serve is running (npx supabase functions serve --env-file supabase/.env.local)

set -e

SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
URL="http://localhost:54321/functions/v1/send-notification-email"
AUTH="Authorization: Bearer $SERVICE_ROLE_KEY"
CT="Content-Type: application/json"

send() {
  local label="$1"
  local body="$2"
  echo -n "  $label ... "
  RESULT=$(curl --max-time 15 -s -w "\n%{http_code}" -X POST "$URL" -H "$CT" -H "$AUTH" -d "$body" 2>&1)
  HTTP_CODE=$(echo "$RESULT" | tail -1)
  BODY=$(echo "$RESULT" | sed '$d')
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ OK"
  else
    echo "❌ HTTP $HTTP_CODE — $BODY"
  fi
}

echo ""
echo "🚀 Triggering all notification email types..."
echo "   Emails will appear at http://localhost:54324"
echo ""

send "(a) Order Placed" '{
  "type":"order_placed",
  "recipients":[{"email":"alice@test.local","name":"Alice Johnson"},{"email":"bob@test.local","name":"Bob Smith"}],
  "product":"Organic Tomatoes","quantity":5,"unit":"box","pointsPerUnit":10,"total":50,
  "orderId":"abc12345-6789-0123-4567-890123456789",
  "buyerName":"Alice Johnson","buyerEmail":"alice@test.local",
  "sellerName":"Bob Smith","sellerEmail":"bob@test.local"
}'

send "(b) Offer Made" '{
  "type":"offer_made",
  "recipients":[{"email":"alice@test.local","name":"Alice Johnson"}],
  "product":"Fresh Strawberries","quantity":10,"unit":"pint","pointsPerUnit":8,
  "sellerName":"Bob Smith","deliveryDate":"2026-03-15",
  "offerMessage":"Fresh from my garden, picked this morning!"
}'

send "(d) Order Disputed" '{
  "type":"order_disputed",
  "recipients":[{"email":"alice@test.local","name":"Alice Johnson"},{"email":"bob@test.local","name":"Bob Smith"}],
  "product":"Organic Tomatoes","orderId":"abc12345-6789-0123-4567-890123456789",
  "disputeReason":"Several tomatoes were bruised and one box had mold"
}'

send "(e) Dispute Resolved" '{
  "type":"dispute_resolved",
  "recipients":[{"email":"alice@test.local","name":"Alice Johnson"},{"email":"bob@test.local","name":"Bob Smith"}],
  "product":"Organic Tomatoes","orderId":"abc12345-6789-0123-4567-890123456789",
  "resolutionOutcome":"Seller offered 15 point discount — buyer accepted",
  "refundAmount":15
}'

send "(f) Chat Initiated" '{
  "type":"chat_initiated",
  "recipients":[{"email":"bob@test.local","name":"Bob Smith"}],
  "senderName":"Alice Johnson","product":"Organic Tomatoes",
  "messagePreview":"Hi Bob! Are your organic tomatoes still available? I would love to get 5 boxes for this weekend."
}'

send "(g) Points Purchase" '{
  "type":"points_purchase",
  "recipients":[{"email":"alice@test.local","name":"Alice Johnson"}],
  "pointsAmount":500,"dollarAmount":5.00,"paymentMethodLast4":"4242"
}'

send "(h1) Redemption — Gift Card" '{
  "type":"points_redemption",
  "recipients":[{"email":"alice@test.local","name":"Alice Johnson"}],
  "pointsAmount":2500,"dollarAmount":25.00,
  "redemptionMethod":"Amazon Gift Card",
  "giftCardBrand":"Amazon",
  "giftCardFaceValue":25,
  "giftCardUrl":"https://www.amazon.com/gc/redeem?claimCode=ABCD-1234-EFGH"
}'

send "(h2) Redemption — Venmo Cashout" '{
  "type":"points_redemption",
  "recipients":[{"email":"bob@test.local","name":"Bob Smith"}],
  "pointsAmount":200,"dollarAmount":2.00,
  "redemptionMethod":"Venmo",
  "redemptionRecipient":"+15551234567"
}'

send "(k) Points Return — Card Refund" '{
  "type":"points_refund",
  "recipients":[{"email":"alice@test.local","name":"Alice Johnson"}],
  "pointsAmount":500,"refundUsdAmount":5.00,
  "cardLast4":"4242","cardBrand":"Visa",
  "refundReason":"Requested refund for unused points"
}'

send "(l) Tax Threshold Warning" '{
  "type":"tax_threshold_warning",
  "recipients":[{"email":"bob@test.local","name":"Bob Smith"}],
  "ytdEarnings":480,"stateThreshold":600,"stateName":"Massachusetts","taxYear":2026
}'

send "(m) Delegation Revoked" '{
  "type":"delegation_revoked",
  "recipients":[{"email":"bob@test.local","name":"Bob Smith"}],
  "delegatorName":"Alice Johnson","delegateName":"Bob Smith","revokedBy":"delegator"
}'

send "(n) Delegation Accepted" '{
  "type":"delegation_accepted",
  "recipients":[{"email":"alice@test.local","name":"Alice Johnson"}],
  "delegateName":"Bob Smith","delegatorName":"Alice Johnson","delegatePct":30
}'

echo ""
echo "✅ Done! Check Mailpit at http://localhost:54324"
echo ""
