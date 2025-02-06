const { Connection, PublicKey } = require('@solana/web3.js');
const { AnchorProvider, Program } = require('@project-serum/anchor');
const axios = require('axios'); // For fetching price from an external API
const fs = require('fs');

let customRPC = `https://YOUR-RPC`;
const readRPC = new Connection(customRPC);
const lamportsPerSol = 1000000000; // 1 SOL = 10^9 lamports

// 1# Your fleet name | #2 Fleet address | #3 Ressources Address | #4 Fuel Address | #5 Nbr of ship in your fleet to get avg
// In order to get Fleet Address, go to solscan and find your lancer wallet. Find a fleetStateHandler transaction. 
// Instructions details -> #2 - SAGE Program: fleetStateHandler -> Input Accounts > #1 - Fleet
// Instructions details -> #2 - SAGE Program: fleetStateHandler -> Input Accounts > #6 - Account is your Fuel Address
// In order to get your ressources Address : Find an tx that transfer the ressources (for SDU a successful scanForSurveyDataUnits for instance)
// take the wallet where the ressources goes. Transfer from "mint address" to "your address".
const FleetsAddress = [
	["FleetName01","Fleet01Address","Fleet01RessourcesAdr","Fleet01FuelAdr",NBRSHIPINFLEET01],
	["FleetName02","Fleet02Address","Fleet02RessourcesAdr","Fleet02FuelAdr",NBRSHIPINFLEET02] // Last line without ,
];

const lancerWallet = "YOUR-LANCER-ADDR";

function arraysToCsv(fleetSDUData,fleetSDUAVGData,fleetFuelData,fleetFeeData) {
  const csvRows = [];
  
  let row = "";
  for (let i = 0; i < fleetSDUData.length; i++) {
	  if(i == fleetSDUData.length-1)
	  {
		row = row.concat(`${fleetSDUData[i].toFixed(1)}`);
	  }
	  else{
		row = row.concat(`${fleetSDUData[i].toFixed(1)},`);
	  }
  }
  csvRows.push(row);
  row = "";
  
  for (let i = 0; i < fleetSDUAVGData.length; i++) {
	  if(i == fleetSDUAVGData.length-1)
	  {
		row = row.concat(`${fleetSDUAVGData[i].toFixed(1)}`);
	  }
	  else{
		row = row.concat(`${fleetSDUAVGData[i].toFixed(1)},`);
	  }
  }
  
  csvRows.push(row);
  row = "";
  
  for (let i = 0; i < fleetFuelData.length; i++) {
	  if(i == fleetFuelData.length-1)
	  {
		row = row.concat(`${fleetFuelData[i].toFixed(1)}`);
	  }
	  else{
		row = row.concat(`${fleetFuelData[i].toFixed(1)},`);
	  }
  }
  
  csvRows.push(row);
  row = "";
  
  for (let i = 0; i < fleetFeeData.length; i++) {
	  if(i == fleetFeeData.length-1)
	  {
		row = row.concat(`${fleetFeeData[i].toFixed(4)}`);
	  }
	  else{
		row = row.concat(`${fleetFeeData[i].toFixed(4)},`);
	  }
  }
  
  csvRows.push(row);

  const csvString = csvRows.join('\n');

  return csvString;
}

function getBalanceChange(txResult, targetAcct) {
  if (!txResult || !txResult.transaction || !txResult.transaction.message || !txResult.transaction.message.staticAccountKeys || !txResult.meta || !txResult.meta.preTokenBalances || !txResult.meta.postTokenBalances) {
    return 0;
  }

  const staticAccountKeys = txResult.transaction.message.staticAccountKeys;
  const preTokenBalances = txResult.meta.preTokenBalances;
  const postTokenBalances = txResult.meta.postTokenBalances;

  let acctIdx = staticAccountKeys.findIndex(item => item.toString() === targetAcct);

  // Handle the case where the account is not found
  if (acctIdx === -1) {
    return 0;
  }

  let preBalanceObj = preTokenBalances.find(item => item.accountIndex === acctIdx);
  let preBalance = preBalanceObj?.uiTokenAmount?.uiAmount || 0;

  let postBalanceObj = postTokenBalances.find(item => item.accountIndex === acctIdx);
  let postBalance = postBalanceObj?.uiTokenAmount?.uiAmount || 0;

  return postBalance - preBalance;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchFleetStats(fleetAddress, nbrTx, type) {
	let pubKey;
	pubKey = new PublicKey(fleetAddress[1]);

  transactionList = await readRPC.getSignaturesForAddress(pubKey, { limit: nbrTx });
  const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    transactionList = transactionList.filter(
      (transaction) => transaction.blockTime >= oneDayAgo.getTime() / 1000
    );
	
  transactionList.sort((a, b) => b.blockTime - a.blockTime);
  if(transactionList.length == nbrTx)
  {
	console.log(`Some txs may be missing. Increase NbrTX`);  
  }
  let sdu = 0;
  let fuel = 0;
  let fee = 0;
  let totalFeesInLamports  = 0;
  
  for (const [index, transaction] of transactionList.entries()) {
		await wait(30);
		const txResult = await readRPC.getTransaction(transaction.signature, {maxSupportedTransactionVersion:0}); 
		if (txResult && txResult.meta) {
			totalFeesInLamports  += txResult.meta.fee; 
		}
	  
		let changesSDUressources;
		changesSDUressources = getBalanceChange(txResult, fleetAddress[2]);
		changesFUELressources = getBalanceChange(txResult, fleetAddress[3]);

		if(changesSDUressources > 0)
		{
			sdu = sdu + changesSDUressources	
		}
		if(changesFUELressources > 0)
		{
			fuel = fuel + changesFUELressources	
		}
    }

  return [sdu, fuel, totalFeesInLamports];
}

async function fetchStats()
{
	let fleetSDUData = FleetsAddress.map(() => 0); 
	let fleetSDUAVGData = FleetsAddress.map(() => 0); 
	let fleetFuelData = FleetsAddress.map(() => 0); 
	let fleetFeeData = FleetsAddress.map(() => 0); 
	let nbrTx = 450;
	let id = 0;
	
	for(fleet of FleetsAddress)
	{
		let consoleID = id+1;
		console.log(`Pull data ${consoleID}/${FleetsAddress.length}`);
		let result = await fetchFleetStats(fleet,nbrTx);
		fleetSDUData[id] = result[0];
		fleetFuelData[id] = result[1];
		fleetFeeData[id] = (result[2]/lamportsPerSol);
		
		await wait(10); // Avoid to hit your request/sec. If you have a plan that allow you to make a bunch of request/sec, you can remove it.
		id = id+1;
		
	}
	id = 1;
	let handler = "       ";
	let dataSDU = " Total ";
	let dataavgSDU = "  AVG  ";
	let dataFUEL = "  FUEL ";
	let dataFEE = "  FEE  ";
	let dataFEEUSDC  = "  USDC ";
	let totalSDU = 0;
	let totalFUEL = 0;
	let totalFEE = 0;
	let totalShips = 0;
	const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const solPriceUsd = response.data.solana.usd; 
	
	for(let i = 0; i < FleetsAddress.length;i++)
	{
		totalSDU = totalSDU+fleetSDUData[i];
		totalFUEL = totalFUEL+fleetFuelData[i];
		totalFEE = totalFEE+fleetFeeData[i];
		totalShips = totalShips+FleetsAddress[id-1][4];
		if(i < 10) {
			handler = handler.concat(` Scanning0${id} | `);	
		}
		else{
			handler = handler.concat(` Scanning${id} | `);
		}
		
		if(fleetSDUData[i] >= 10000)
		{
			dataSDU = dataSDU.concat(`    ${fleetSDUData[i]}     `);
		}
		else if (fleetSDUData[i] >= 1000){
			dataSDU = dataSDU.concat(`     ${fleetSDUData[i]}     `);
		}
		else if (fleetSDUData[i] >= 100){
			dataSDU = dataSDU.concat(`    ${fleetSDUData[i]}     `);
		}
		else if (fleetSDUData[i] >= 10){
			dataSDU = dataSDU.concat(`   ${fleetSDUData[i]}     `);
		}
		else
		{
			dataSDU = dataSDU.concat(`     ${fleetSDUData[i]}      `);
		}
		
		let avg = Math.floor(fleetSDUData[i] / FleetsAddress[id-1][4]);
		fleetSDUAVGData[i] = avg;
		if(avg >= 10000)
		{
			dataavgSDU = dataavgSDU.concat(`    ${avg}     `);	
		}
		else if (avg >= 1000){
			dataavgSDU = dataavgSDU.concat(`     ${avg}     `);	
		}
		else if (avg >= 100){
			dataavgSDU = dataavgSDU.concat(`      ${avg}     `);	
		}
		else
		{
			dataavgSDU = dataavgSDU.concat(`     ${avg}     `);
		}
		dataFUEL = dataFUEL.concat(`    ${fleetFuelData[i]}    `);
		let fee = fleetFeeData[i].toFixed(4)
		dataFEE = dataFEE.concat(`    ${fee}    `);
		let feeUSDC = (fleetFeeData[i]*solPriceUsd).toFixed(2);
		if(feeUSDC >= 10)
		{
			dataFEEUSDC = dataFEEUSDC.concat(`     ${feeUSDC}    `);
		}
		else{
			dataFEEUSDC = dataFEEUSDC.concat(`     ${feeUSDC}     `);
		}
		
		
		id = id+1;
		
	}
	console.log(handler);
	console.log(dataSDU);
	console.log(dataavgSDU);
	console.log(dataFUEL);
	console.log(dataFEE);
	console.log(dataFEEUSDC);
	console.log(`In total ${totalSDU} SDUs was collected`);
	let avg = Math.floor(totalSDU / totalShips);
	console.log(`Average of ${avg} SDUs per Ship`);
	console.log(`In total ${totalFUEL} FUELs was burned`);
	let totalFeeUSDC = (totalFEE*solPriceUsd).toFixed(2);
	console.log(`In total ${totalFEE}sol (${totalFeeUSDC}$) fee was paid`);
  
	const csvData = arraysToCsv(fleetSDUData,fleetSDUAVGData,fleetFuelData,fleetFeeData);
	try {
		fs.writeFileSync('fleet_stats.csv', csvData);
		console.log('CSV data written to fleet_stats.csv');
  } catch (err) {
		console.error('Error writing to file:', err);
  }
}

fetchStats();
