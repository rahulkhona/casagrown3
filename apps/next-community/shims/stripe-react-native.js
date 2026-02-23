// Shim for @stripe/stripe-react-native on web
// The native Stripe SDK is not available on web — use @stripe/stripe-js instead
const React = require('react')

const StripeProvider = ({ children }) => children

module.exports = {
  StripeProvider,
  useStripe: () => ({}),
  useConfirmPayment: () => ({}),
  CardField: () => null,
}
