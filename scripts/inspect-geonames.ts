import yauzl from "yauzl";
import readline from "node:readline";

yauzl.open(".geonames/IR.zip", { lazyEntries: true }, (err, zip) => {
  if (err) throw err;

  zip!.readEntry();

  zip!.on("entry", (entry) => {
    console.log("ENTRY:", entry.fileName);

    if (entry.fileName === "IR.txt") {
      zip!.openReadStream(entry, (err, stream) => {
        if (err) throw err;
        if (!stream) throw new Error("no stream");

        const rl = readline.createInterface({
          input: stream,
          crlfDelay: Infinity,
        });

        let count = 0;

        rl.on("line", (line) => {
          if (count < 5) {
            console.log("\nRAW LINE:");
            console.log(line);

            const parts = line.split("\t");

            console.log({
              id: parts[0],
              name: parts[1],
              ascii: parts[2],
              featureClass: parts[6],
              featureCode: parts[7],
              country: parts[8],
              admin1: parts[10],
              population: parts[14],
            });

            count++;
          }

          if (count === 5) {
            rl.close();
            zip!.close();
          }
        });
      });
    } else {
      zip!.readEntry();
    }
  });
});