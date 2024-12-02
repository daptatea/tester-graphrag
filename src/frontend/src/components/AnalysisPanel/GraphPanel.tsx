import { Stack } from "@fluentui/react";
import { useContext, useEffect, useState } from "react";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import json from "react-syntax-highlighter/dist/esm/languages/hljs/json";
import { a11yLight } from "react-syntax-highlighter/dist/esm/styles/hljs";
import CytoscapeComponent from 'react-cytoscapejs';

import styles from "./AnalysisPanel.module.css";

import { Thoughts, PAIDRetrievalMode } from "../../api";
import { AppStateContext } from '../../AppStateContext/AppStateContext';
import Loading from './Loading';

SyntaxHighlighter.registerLanguage("json", json);

interface Props {
    thoughts: Thoughts[];
    question?: string;
    useAdvancedFlow?: boolean;
    retrieveCount?: number;
    temperature?: number;
    retrievalMode?: PAIDRetrievalMode;
}

function convertRefs(value: number): number {
    return Math.max(value * 3, 15);
}

export const GraphPanel = ({ thoughts, question, useAdvancedFlow, retrieveCount, retrievalMode, temperature }: Props) => {
    
    const [case_ids, setCaseIds] = useState<string[]>([]);
    const [isLoadingGraphData, setLoadingGraphData] = useState(false);

    // call endpoint to get case ids returned by the query
    // in this case we are running the query again, but stopping
    // just when able to get the resulting cases
    // but not streaming the results

    useEffect(() => {
        
        setLoadingGraphData(true);

        fetch('/chat/get_graph_ui_results', {
            method: 'POST',
            body: JSON.stringify({
                messages: [
                    {
                        content: question,
                        role: "user"
                    }
                ],
                context: {
                    overrides: {
                        use_advanced_flow: useAdvancedFlow,
                        top: retrieveCount,
                        retrieval_mode: retrievalMode,
                        temperature: temperature
                    }
                },
                sessionState: null
            }),
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
            },
        })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then((json) => {
            setCaseIds(json.ids);
            console.log(json);
        })
        .catch((error) => {
            console.error('Error:', error);
        })
        .finally(() => {setLoadingGraphData(false);});
    }, []);

    const appStateContext = useContext(AppStateContext);
    
    if (!appStateContext) {
        throw new Error('Layout component must be used within an AppStateProvider');
    }
    
    const { sharedState, setSharedState, isLoading, setIsLoading } = appStateContext;

    const decodeSelection = (vector: number, semantic: number, graph: number) => {
        switch (sharedState) {
            case PAIDRetrievalMode.Vector:
                if (vector === 1) return 8;
                break;

            case PAIDRetrievalMode.Semantic:
                if (semantic === 1) return 8;
                break;

            case PAIDRetrievalMode.GraphRAG:
                if (graph === 1) return 8;
                break;
        }
    };
    
    const decode = (vector: any, semantic: any, graph: any) => {
        switch (sharedState) {
            case PAIDRetrievalMode.Vector:
                return vector;
            case PAIDRetrievalMode.Semantic:
                return semantic;
            case PAIDRetrievalMode.GraphRAG:
                return graph;
        }
    };

    const checkCaseIds = (id: string): number => {
        let selectionValue = 0;
        
        if (case_ids.includes(id)) {
            selectionValue = 8;
        }
        
        return selectionValue;
    };

    const getRecallPercentage = () => {
        //const goldenDataset = ['615468', '4975399', '1034620', '1127907', '1095193', '1186056', '4953587', '2601920', '594079', '1279441'];
        const goldenDataset = ['615468', '1034620', '1127907', '1095193', '1186056', '2601920', '594079', '768356', '1005731', '1017660'];
        
        const goldenSet = new Set(goldenDataset);
        const matches = case_ids.filter(id => goldenSet.has(id)).length;        
        const percentage = (matches / 10) * 100;
        return percentage;
    };

    function getColorFromPercentage(percentage: number): string {
        // Clamp the percentage between 0 and 100
        const clampedPercentage = Math.max(0, Math.min(100, percentage));
    
        // Calculate red and green values based on the percentage
        const red = Math.round(255 * (1 - clampedPercentage / 100));
        const green = Math.round(255 * (clampedPercentage / 100));
        const blue = 0; // No blue component in this gradient
    
        // Convert RGB values to a hexadecimal color string
        const toHex = (value: number) => value.toString(16).padStart(2, '0');
        const hexColor = `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
    
        return hexColor;
    }

    const elements = [
        // GraphRAG
        { data: { id: '615468',  refs: convertRefs(5),  selection: checkCaseIds('615468'), color: '#ed8035', label: 'Le Vette v. Hardman Estate' }, position: { x: 850, y: 600 } },
        { data: { id: '4975399', refs: convertRefs(12), selection: checkCaseIds('4975399'), color: '', label: 'Laurelon Terrace, Inc. v. City of Seattle' }, position: { x: 1100, y: 320 } }, //selected in semantic
        { data: { id: '1034620', refs: convertRefs(5),  selection: checkCaseIds('1034620'), color: '#ed8035', label: 'Jorgensen v. Massart' }, position: { x: 250, y: 220 } },
        { data: { id: '1127907', refs: convertRefs(22), selection: checkCaseIds('1127907'), color: '#ed8035', label: 'Foisy v. Wyman' }, position: { x: 740, y: 190 } },
        { data: { id: '1095193', refs: convertRefs(7),  selection: checkCaseIds('1095193'), color: '#ed8035', label: 'Thomas v. Housing Authority' }, position: { x: 430, y: 300 } },
        { data: { id: '1186056', refs: convertRefs(40), selection: checkCaseIds('1186056'), color: '#ed8035', label: 'Stuart v. Coldwell Banker Commercial Group, Inc.' }, position: { x: 950, y: 140 } },
        { data: { id: '4953587', refs: convertRefs(13), selection: checkCaseIds('4953587'), color: '', label: 'Schedler v. Wagner' }, position: { x: 800, y: 350 } },
        { data: { id: '2601920', refs: convertRefs(10), selection: checkCaseIds('2601920'), color: '#ed8035', label: 'Pappas v. Zerwoodis' }, position: { x: 500, y: 400 } },
        { data: { id: '594079',  refs: convertRefs(1),  selection: checkCaseIds('594079'), color: '#ed8035', label: 'Martindale Clothing Co. v. Spokane & Eastern Trust Co.' }, position: { x: 530, y: 590 } },
        { data: { id: '1279441', refs: convertRefs(9),  selection: checkCaseIds('1279441'), color: '', label: 'Tope v. King County' }, position: { x: 1010, y: 470 } },

        // GraphRAG Refs
        { data: { id: '615468-1',  refs: 15 }, position: { x: 820, y: 540 } }, // { x: 850, y: 660 } }
        { data: { id: '4975399-1',  refs: 15 }, position: { x: 1070, y: 260 } }, // { x: 1100, y: 320 } }
        { data: { id: '4975399-2',  refs: 15 }, position: { x: 1130, y: 260 } }, // { x: 1100, y: 320 } }
        { data: { id: '1034620-1',  refs: 15 }, position: { x: 280, y: 160 } }, // { x: 250, y: 220 } }
        { data: { id: '1127907-1',  refs: 15 }, position: { x: 710, y: 110 } }, // { x: 700, y: 180 } }
        { data: { id: '1127907-2',  refs: 15 }, position: { x: 770, y: 110 } }, // { x: 700, y: 180 } }
        { data: { id: '1127907-3',  refs: 15 }, position: { x: 670, y: 135 } }, // { x: 700, y: 180 } }
        { data: { id: '1127907-4',  refs: 15 }, position: { x: 810, y: 135 } }, // { x: 700, y: 180 } }
        { data: { id: '1095193-1',  refs: 15 }, position: { x: 400, y: 240 } }, // { x: 430, y: 300 } }
        { data: { id: '1186056-1',  refs: 15 }, position: { x: 930, y: 10 } }, // { x: 950, y: 140 } }
        { data: { id: '1186056-2',  refs: 15 }, position: { x: 970, y: 10 } }, // { x: 950, y: 140 } }
        { data: { id: '1186056-3',  refs: 15 }, position: { x: 900, y: 16 } }, // { x: 950, y: 140 } }
        { data: { id: '1186056-4',  refs: 15 }, position: { x: 1000, y: 16 } }, // { x: 950, y: 140 } }
        { data: { id: '1186056-5',  refs: 15 }, position: { x: 870, y: 30 } }, // { x: 950, y: 140 } }
        { data: { id: '1186056-6',  refs: 15 }, position: { x: 1030, y: 30 } }, // { x: 950, y: 140 } }
        { data: { id: '1186056-7',  refs: 15 }, position: { x: 845, y: 45 } }, // { x: 950, y: 140 } }
        { data: { id: '1186056-8',  refs: 15 }, position: { x: 1055, y: 45 } }, // { x: 950, y: 140 } }
        { data: { id: '4953587-1',  refs: 15 }, position: { x: 770, y: 290 } }, // { x: 800, y: 350 } }
        { data: { id: '4953587-2',  refs: 15 }, position: { x: 830, y: 290 } }, // { x: 800, y: 350 } }
        { data: { id: '2601920-1',  refs: 15 }, position: { x: 470, y: 340 } }, // { x: 500, y: 400 } }
        { data: { id: '2601920-2',  refs: 15 }, position: { x: 530, y: 340 } }, // { x: 500, y: 400 } }
        { data: { id: '594079-1',  refs: 15 }, position: { x: 500, y: 530 } }, // { x: 530, y: 650 } }
        { data: { id: '1279441-1',  refs: 15 }, position: { x: 980, y: 410 } }, // { x: 950, y: 550 } }
        { data: { id: '1279441-2',  refs: 15 }, position: { x: 1040, y: 410 } }, // { x: 950, y: 550 } }

        // Edges from Graph Refs
        { data: { source: '615468-1', target: '615468' }, classes: 'directed' },
        { data: { source: '4975399-1', target: '4975399' }, classes: 'directed' },
        { data: { source: '4975399-1', target: '1279441' }, classes: 'directed' },
        { data: { source: '4975399-2', target: '4975399' }, classes: 'directed' },
        { data: { source: '1034620-1', target: '1034620' }, classes: 'directed' },
        { data: { source: '1127907-1', target: '1127907' }, classes: 'directed' },
        { data: { source: '1127907-2', target: '1127907' }, classes: 'directed' },
        { data: { source: '1127907-3', target: '1127907' }, classes: 'directed' },
        { data: { source: '1127907-3', target: '1095193' }, classes: 'directed' },
        { data: { source: '1127907-4', target: '1127907' }, classes: 'directed' },
        { data: { source: '1095193-1', target: '1095193' }, classes: 'directed' },
        { data: { source: '1186056-1', target: '1186056' }, classes: 'directed' },
        { data: { source: '1186056-2', target: '1186056' }, classes: 'directed' },
        { data: { source: '1186056-3', target: '1186056' }, classes: 'directed' },
        { data: { source: '1186056-4', target: '1186056' }, classes: 'directed' },
        { data: { source: '1186056-5', target: '1186056' }, classes: 'directed' },
        { data: { source: '1186056-6', target: '1186056' }, classes: 'directed' },
        { data: { source: '1186056-7', target: '1186056' }, classes: 'directed' },
        { data: { source: '1186056-7', target: '1127907' }, classes: 'directed' },
        { data: { source: '1186056-8', target: '1186056' }, classes: 'directed' },
        { data: { source: '4953587-1', target: '4953587' }, classes: 'directed' },
        { data: { source: '4953587-2', target: '4953587' }, classes: 'directed' },
        { data: { source: '2601920-1', target: '2601920' }, classes: 'directed' },
        { data: { source: '2601920-2', target: '2601920' }, classes: 'directed' },
        { data: { source: '594079-1', target: '594079' }, classes: 'directed' },
        { data: { source: '1279441-1', target: '1279441' }, classes: 'directed' },
        { data: { source: '1279441-2', target: '1279441' }, classes: 'directed' },

        // Semantic
        { data: { id: '481657',   refs: convertRefs(0),  selection: checkCaseIds('481657'), color: '', label: 'Swanson v. White & Bollard, Inc.' }, position: { x: 270, y: 470 } },
        { data: { id: '630224',   refs: convertRefs(1),  selection: checkCaseIds('630224'), color: '', label: 'Imperial Candy Co. v. City of Seattle' }, position: { x: 1200, y: 600 } },
        { data: { id: '1346648',  refs: convertRefs(3),  selection: checkCaseIds('1346648'), color: '', label: 'Tombari v. City of Spokane' }, position: { x: 680, y: 495 } },
        { data: { id: '768356',   refs: convertRefs(3),  selection: checkCaseIds('768356'), color: '#ed8035', label: 'Uhl Bros. v. Hull' }, position: { x: 1080, y: 540 } },
        { data: { id: '1005731',  refs: convertRefs(0),  selection: checkCaseIds('1005731'), color: '#ed8035', label: 'Finley v. City of Puyallup' }, position: { x: 650, y: 300 } },

        // Vector
        { data: { id: '674990',   refs: convertRefs(0),  selection: checkCaseIds('674990'), color: '', label: 'Woolworth Co. v. City of Seattle' }, position: { x: 220, y: 560 } },
        { data: { id: '4938756',  refs: convertRefs(5),  selection: checkCaseIds('4938756'), color: '', label: 'Stevens v. King County' }, position: { x: 270, y: 340 } },
        { data: { id: '5041745',  refs: convertRefs(0),  selection: checkCaseIds('5041745'), color: '', label: 'Frisken v. Art Strand Floor Coverings, Inc.' }, position: { x: 1250, y: 240 } },
        { data: { id: '1017660',  refs: convertRefs(4),  selection: checkCaseIds('1017660'), color: '#ed8035', label: 'United Mutual Savings Bank v. Riebli' }, position: { x: 1170, y: 200 } },
        { data: { id: '782330',   refs: convertRefs(0),  selection: checkCaseIds('782330'), color: '', label: 'DeHoney v. Gjarde' }, position: { x: 1230, y: 540 } },

        // Vector Refs
        { data: { id: '4938756-1',  refs: 15 }, position: { x: 300, y: 280 } }, // { x: 270, y: 340 } }
        { data: { id: '1017660-1',  refs: 15 }, position: { x: 1200, y: 140 } }, // { x: 1170, y: 200 } }

        // Edges from Vector Refs
        { data: { source: '4938756-1', target: '4938756' }, classes: 'directed' },
        { data: { source: '1017660-1', target: '1017660' }, classes: 'directed' },

     ];
    return (        
        <div style={{ position: 'relative', width: '99%' }}>
            
            {isLoadingGraphData && <div className="spinner-border">Loading...</div>}

            {!isLoadingGraphData &&
            <>
            <div className={styles.graphRecall}>Recall: <span style={{ color: getColorFromPercentage(getRecallPercentage()) }}>{getRecallPercentage()}%</span></div>            
            <p></p>
            <div className={styles.graphRecall}><b>Question:</b> {question}</div>
            
            <CytoscapeComponent 
                elements={elements} 
                className={styles.graphContainer} 
                style={{ width: '100%', height: '640px' }}
                layout={{ name: 'preset' }}
                stylesheet={[
                    {
                        selector: 'node',
                        style: {
                            'label': 'data(label)',
                            'width': 'data(refs)',
                            'height': 'data(refs)',
                            'background-color': 'data(color)',
                            'border-color': '#0fd406',           // Replaces outline-color
                            'border-opacity': 0.7,               // Replaces outline-opacity
                            'border-width': 'data(selection)',   // Replaces outline-width
                            'border-style': 'solid',             // Replaces outline-style
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            'curve-style': 'bezier',
                            'target-arrow-shape': 'triangle',
                            'width': 1,
                        }
                    }
                ]}
            />
            </>}
        </div>        
    );
};


/*
<h1>useAdvancedFlow {useAdvancedFlow}</h1>
            <h1>retrieveCount {retrieveCount}</h1>
            <h1>retrievalMode {retrievalMode}</h1>
            <h1>temperature {temperature}</h1>*/
