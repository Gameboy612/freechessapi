import { EngineLine, Evaluation } from "./types";

const stockfish = require("stockfish");

export class Stockfish {

    private worker = stockfish();

    depth = 0;

    constructor() {

        this.worker.postMessage("uci");
        this.worker.postMessage("setoption name MultiPV value 2");
    }

    async evaluate(fen: string, targetDepth: number, verbose: boolean = false): Promise<EngineLine[]> {
        this.worker.postMessage("position fen " + fen);
        this.worker.postMessage("go depth " + targetDepth);

        const messages: string[] = [];
        const lines: EngineLine[] = [];


        return new Promise(res => {
            this.worker.onmessage = (message: any) => {
                messages.unshift(message);
                if (message == undefined) return

                if (verbose) console.log(message);

                // Get latest depth for progress monitoring
                let latestDepth = parseInt(message.match(/(?:depth )(\d+)/)?.[1] || "0");
                this.depth = Math.max(latestDepth, this.depth);
                
                // Best move or checkmate log indicates end of search
                if (message.startsWith("bestmove") || message.includes("depth 0")) {            
                    let searchMessages = messages.filter(msg => msg.startsWith("info depth"));

                    for (let searchMessage of searchMessages) {
                        // Extract depth, MultiPV line ID and evaluation from search message
                        let idString = searchMessage.match(/(?:multipv )(\d+)/)?.[1];
                        let depthString = searchMessage.match(/(?:depth )(\d+)/)?.[1];

                        let moveUCI = searchMessage.match(/(?: pv )(.+?)(?= |$)/)?.[1];

                        let evaluation: Evaluation = {
                            type: searchMessage.includes(" cp ") ? "cp" : "mate",
                            value: parseInt(searchMessage.match(/(?:(?:cp )|(?:mate ))([\d-]+)/)?.[1] || "0")
                        };

                        // Invert evaluation if black to play since scores are from black perspective
                        // and we want them always from the perspective of white
                        if (fen.includes(" b ")) {
                            evaluation.value *= -1;
                        }

                        // If any piece of data from message is missing, discard message
                        if (!idString || !depthString || !moveUCI) continue;

                        let id = parseInt(idString);
                        let depth = parseInt(depthString);

                        // Discard if target depth not reached or lineID already present
                        if (depth != targetDepth || lines.some(line => line.id == id)) continue;
                        
                        lines.push({
                            id,
                            depth,
                            evaluation,
                            moveUCI
                        });
                    }
                    res(lines);
                }
            };
        });
    }

}
