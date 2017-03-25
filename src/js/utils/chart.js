import Chart from 'chart.js';

export function destroyCharts(viewState) {
	viewState.activeCharts.forEach(chart => {
		chart.chart.destroy();
		const chartContainer = document.getElementById(chart.id);
		chartContainer.parentNode.removeChild(chartContainer);
	});
	return viewState.activeCharts = [];
}

export function createChart(chartDetails, paymentGraph, labels) {
	const canvas = document.createElement('canvas');
	const id = chartDetails.id;
	canvas.id = id;
	document.getElementById('chart_container').appendChild(canvas);
	return new Chart(id, {
		type: 'bar',
		data: {
			labels: labels,
			datasets: [
				{
					label: 'Amount Paid',
					type: 'line',
					// yAxisId: 'amount_paid',
					borderColor: '#e74c3c',
					backgroundColor: '#e74c3c',
					fill: false,
					data: Object.values(paymentGraph).map(item => parseInt(item.amountPaid) / 100)
				},
				{
					label: 'Amount Remaining',
					type: 'bar',
					yAxisId: 'amount_left',
					backgroundColor: '#3498db',
					borderColor: '#3498db',
					data: Object.values(paymentGraph).map(item => parseInt(item.amountLeft) / 100)
				}
			],
			borderWidth: 1
		},
		options: {
			tooltips: {
				callbacks: {
					label: function(tooltipItems, data) {
						return data.datasets[tooltipItems.datasetIndex].label +': $' + tooltipItems.yLabel;
					}
				}
			},
			title: {
				display: true,
				text: chartDetails.name,
				position: 'top'
			},
			legend: {
				position: 'bottom'
			},
			scales: {
				yAxes: [
					{
						stacked: false,
						position: 'left',
						id: 'amount_left'
					}
					// , {
					// 	stacked: false,
					// 	position: 'right',
					// 	id: 'amount_paid'
					// }
				]
			}
		}
	});
}