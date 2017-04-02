import moment from 'moment';
import {sortArray, sortByRate, sortByAmount} from './functions';
import {createChart} from './chart';
import isSet from 'is-it-set';

function calculateMonthlyInterestRate(interest) {
	return ((interest / 12) / 100);
}

function calculateMinimumMonthlyRepayment(interest, debtAmount) {
	const monthlyInterest = calculateMonthlyInterestRate(interest);
	return ((monthlyInterest * debtAmount) + (debtAmount * 0.01));
}

function calculateMonthlyInterest(interest, debt) {
	return ((calculateMonthlyInterestRate(interest) * debt) * 100);
}

function isDebtValid(debt) {
	const minMonthlyRepayment = calculateMinimumMonthlyRepayment(debt.interest, debt.amount);
	if (debt.amount <= 0) {
		return {
			error: true,
			target: 'amount',
			message: 'The debt amount must be greater than 0.'
		};
	}
	if (debt.minPayment <= 0) {
		return {
			error: true,
			target: 'minPayment',
			message: 'The debt amount must be greater than 0.'
		};
	}
	if (minMonthlyRepayment >= debt.minPayment) {
		return {
			error: true,
			target: 'minPayment',
			message: `The monthly payment is less than the recommended minimum payment of $${Math.ceil(minMonthlyRepayment)}`
		};
	}

	return {
		error: false,
		target: null,
		message: null
	};
}

function sanitiseDebts(debts) {
	return debts.map(debt => {
		return {
			...debt,
			amount: !debt.amount ? 0 : parseInt(debt.amount),
			minPayment: !debt.minPayment ? 0 : parseInt(debt.minPayment),
			interest: !debt.interest ? 0 : parseInt(debt.interest)
		}
	})
}

export function calculateDebts(appState) {
	const sanitisedDebts = sanitiseDebts(appState.userData.debts);
	const sortedDebts = appState.viewState.debtMethod === 'snowball'
		? sortArray(sanitisedDebts, sortByAmount)
		: sortArray(sanitisedDebts, sortByRate).reverse();
	const processedDebts = sortedDebts.reduce((acc, debt, index) => {
		const validatedDebt = isDebtValid(debt);
		if (!validatedDebt.error) {
			if (index === 0) {
				return [
					...acc,
					handleDebtCalculation(appState.userData, debt)
				];
			} else {
				const previousDebt = acc[acc.length - 1];
				const previousDebtRepayments = previousDebt.repayments;
				const lastMonthIndex = Math.max(...Object.keys(previousDebtRepayments));
				const previousDebtBasePayment = parseInt(previousDebt.minPayment) + parseInt(appState.userData.extraContributions);
				const moneyLeftFromLastMonth = previousDebtBasePayment - (previousDebtRepayments[lastMonthIndex - 1].amountPaid / 100);
				return [
					...acc,
					handleDebtCalculation(appState.userData, debt, lastMonthIndex, moneyLeftFromLastMonth)
				];
			}
		} else {
			return [
				...acc,
				{
					...debt,
					error: validatedDebt
				}
			];
		}
	}, []);
	if (processedDebts.length !== 0) {
		appState.userData.debts = appState.userData.debts.map(debt => {
			return processedDebts.find(processedDebt => {
				return processedDebt.id === debt.id;
			});
		});
		const labels = getChartLabelsFromDebt(processedDebts[processedDebts.length - 1]);
		processedDebts.forEach(processedDebt => {
			if (!processedDebt.error.error) {
				const chartReference = appState.viewState.activeCharts.find(chart => chart.id === processedDebt.id);
				if (!!chartReference) {
					const chart = chartReference.chart;
					const debtBreakdown = processedDebt.repayments;
					chart.options.title.text = processedDebt.name;
					chart.data.labels = labels;
					// Update Amount Paid dataset
					chart.data.datasets[0].data = Object.values(debtBreakdown).map(item => parseInt(item.amountPaid) / 100);
					// Update Amount Left dataset
					chart.data.datasets[1].data = Object.values(debtBreakdown).map(item => parseInt(item.amountLeft) / 100);
					chart.update();
				} else {
					appState.viewState.activeCharts = [
						...appState.viewState.activeCharts,
						{
							id: processedDebt.id,
							chart: createChart({id: processedDebt.id, name: processedDebt.name}, processedDebt.repayments, labels)
						}
					];
				}
			}
		});
	}
}

function getChartLabelsFromDebt(debt) {
	if (!!debt.repayments) {
		return Object.keys(debt.repayments).map(month => {
			return moment().add(month, 'months').format('MMM, YYYY');
		});
	} else {
		return undefined;
	}
}

function handleDebtCalculation(userData, debt, prevDebtPaidOffMonth, lastMonthLeftOverMoney) {
	const {name, id, amount, interest, minPayment} = debt;
	const adjustedDebt = parseInt(debt.amount) * 100;
	const adjustedRate = parseInt(debt.interest) / 100;
	const adjustedRepayment = parseInt(debt.minPayment) * 100;
	const parsedExtraContributions = isSet(userData.extraContributions) ? (userData.extraContributions * 100) : 0;
	const repayments = calculateRepayments(adjustedDebt, adjustedRepayment, adjustedRate, 1, {}, parsedExtraContributions, prevDebtPaidOffMonth, lastMonthLeftOverMoney);
	const interestPaid = Object.values(repayments).reduce((acc, curr) => {
		return acc + curr.interestPaid;
	}, 0);
	return {
		name,
		id,
		amount,
		interest,
		minPayment,
		repayments,
		interestPaid,
		totalPaid: (interestPaid + (debt.amount * 100)),
		error: {
			target: null,
			message: null
		}
	};
}

function calculateRepayments(debt, repay, interest, month = 1, valueSoFar = {}, extraContributions, monthToAddExtraContributions, rolloverFromLastDebt) {
	if (debt > 0) {
		const adjustedRepayment = parseFloat(month) >= parseFloat(monthToAddExtraContributions) || !monthToAddExtraContributions
			? (repay + extraContributions)
			: repay;
		const monthlyInterest = calculateMonthlyInterest(interest, debt);
		const newDebt = !!rolloverFromLastDebt && month === (monthToAddExtraContributions - 1)
			? ((debt + monthlyInterest) - (adjustedRepayment + (rolloverFromLastDebt * 100)))
			: ((debt + monthlyInterest) - adjustedRepayment);
		const parsedRollover = !!rolloverFromLastDebt && month === (monthToAddExtraContributions - 1) ? rolloverFromLastDebt * 100 : 0;
		return calculateRepayments(newDebt, repay, interest, month + 1, {
			...valueSoFar,
			[month]: {
				amountLeft: debt,
				// If the debt left is less than our regular repayment, just pay what's left
				amountPaid: debt <= adjustedRepayment + parsedRollover ? debt : adjustedRepayment + parsedRollover,
				interestPaid: monthlyInterest
			}
		}, extraContributions, monthToAddExtraContributions, rolloverFromLastDebt);
	} else {
		return {
			...valueSoFar,
			[month]: {
				amountLeft: 0,
				amountPaid: 0,
				interestPaid: 0
			}
		};
	}
}

function getDefaultLabels(monthsToAdd, valueSoFar = [], index = 0) {
	if (index <= (monthsToAdd - 1)) {
		return getDefaultLabels(monthsToAdd, [
			...valueSoFar,
			moment().add(index, 'months').format('MMM, YYYY')
		], index + 1)
	} else {
		return valueSoFar;
	}
}