export function hasPrimeEligibility(item) {
  const deliveryText = String(item?.delivery || '')

  return Boolean(
    item?.isPrime ||
    item?.is_prime ||
    item?.primeEligible ||
    item?.isPrimeEligible ||
    /\bprime\b/i.test(deliveryText),
  )
}
