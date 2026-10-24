/**
 * Pricing and discount calculation utility
 * Aligns with Section 10.3 of Course Platform Backend Plan:
 * "percentage: offer_price = price - (price * discount_value / 100)"
 * "fixed:      offer_price = price - discount_value (kabhi 0 se neeche nahi)"
 * "discount_percentage = round((price - offer_price) / price * 100)"
 * "active offer = is_active AND starts_at <= now <= ends_at AND (usage_limit is null OR usage_count < usage_limit)"
 */

function isOfferActive(offer, now = new Date()) {
  if (!offer || !offer.is_active) return false;
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const startTime = new Date(offer.starts_at).getTime();
  const endTime = new Date(offer.ends_at).getTime();

  if (currentTime < startTime || currentTime > endTime) {
    return false;
  }

  if (offer.usage_limit !== null && offer.usage_limit !== undefined && offer.usage_limit > 0) {
    if ((offer.usage_count || 0) >= offer.usage_limit) {
      return false;
    }
  }

  return true;
}

function calculateDiscountedPrice(price, offer, now = new Date()) {
  const originalPrice = Number(price) || 0;
  if (originalPrice <= 0 || !isOfferActive(offer, now)) {
    return {
      price: originalPrice,
      offer_price: null,
      discount_percentage: 0,
      offer_active: false,
    };
  }

  let offerPrice = originalPrice;
  const discountValue = Number(offer.discount_value) || 0;

  if (offer.discount_type === 'percentage') {
    offerPrice = originalPrice - (originalPrice * discountValue) / 100;
  } else if (offer.discount_type === 'fixed') {
    offerPrice = originalPrice - discountValue;
  }

  // Ensure offer price never drops below 0
  offerPrice = Math.max(0, Math.round(offerPrice * 100) / 100);

  const discountPercentage = originalPrice > 0
    ? Math.round(((originalPrice - offerPrice) / originalPrice) * 100)
    : 0;

  return {
    price: originalPrice,
    offer_price: offerPrice,
    discount_percentage: discountPercentage,
    offer_active: true,
  };
}

module.exports = {
  isOfferActive,
  calculateDiscountedPrice,
};
