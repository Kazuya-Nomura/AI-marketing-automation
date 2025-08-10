class ROICalculator {
  calculatePropertyROI(investment, rentalIncome, appreciation, expenses) {
    const annualRentalROI = (rentalIncome * 12 - expenses) / investment * 100;
    const totalROI = annualRentalROI + appreciation;
    return {
      rental: annualRentalROI,
      appreciation: appreciation,
      total: totalROI,
      breakEvenYears: investment / (rentalIncome * 12 - expenses)
    };
  }
}