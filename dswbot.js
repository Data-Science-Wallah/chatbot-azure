const { ActivityHandler, MessageFactory } = require('botbuilder');
const request = require('request');

class DSWBOT extends ActivityHandler {
    constructor() {
        super();

        this.awaitingKeyword = false;
        this.awaitingFeedback = false;
        this.awaitingNextSteps = false;
        this.activeAPI = null;

        this.onMessage(async (context, next) => {
            const text = context.activity.text;
            if (this.awaitingKeyword) {
                this.awaitingKeyword = false;
                await this.handleAPI(context, text);
            } else if (this.awaitingFeedback) {
                await this.handleFeedback(context, text);
            } else if (this.awaitingNextSteps) {
                await this.handleNextSteps(context, text);
            } else {
                if (text.toLowerCase() === 'faq' || text.toLowerCase() === 'clu' || text.toLowerCase() === 'weather') {
                    this.activeAPI = text.toLowerCase();
                    await context.sendActivity('Please enter the keyword:');
                    this.awaitingKeyword = true;
                } else {
                    const replyText = `Echo: ${text}`;
                    await context.sendActivity(MessageFactory.text(replyText, replyText));
                }
            }
            await next();
        });

        this.onMembersAdded(async (context, next) => {
            await this.sendWelcomeMessage(context);
            await next();
        });
    }

    async sendWelcomeMessage(turnContext) {
        const { activity } = turnContext;
        for (const member of activity.membersAdded) {
            if (member.id !== activity.recipient.id) {
                const welcomeMessage = `Hi, I am DSW bot how may i help you ${member.name}.`;
                await turnContext.sendActivity(welcomeMessage);
                await this.sendSuggestedActions(turnContext);
            }
        }
    }

    async sendSuggestedActions(turnContext) {
        const reply = MessageFactory.suggestedActions(["FAQ", "CLU", "Weather"], "What would you like to do today?");
        await turnContext.sendActivity(reply);
    }

    async handleAPI(context, keyword) {
        if (this.activeAPI === 'faq') {
            await this.callFAQAPI(context, keyword);
        } else if (this.activeAPI === 'clu') {
            await this.callCLUAPI(context, keyword);
        } else if (this.activeAPI === 'weather') {
            await this.detectWeather(context, keyword);
        }
    }

    async callFAQAPI(context, question) {
        const options = {
            method: 'POST',
            url: 'https://dswinstance.cognitiveservices.azure.com/language/:query-knowledgebases?projectName=faq&api-version=2021-10-01&deploymentName=production',
            headers: {
                'Ocp-Apim-Subscription-Key': '681f9c6047a14f57ad6d7088ba19090a',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                top: 1,
                question: question,
                includeUnstructuredSources: true,
                confidenceScoreThreshold: 0.3,
                answerSpanRequest: {
                    enable: true,
                    topAnswersWithSpan: 1,
                    confidenceScoreThreshold: 0.2
                }
            })
        };

        try {
            const response = await new Promise((resolve, reject) => {
                request(options, function (error, response, body) {
                    if (error) {
                        console.error('Error making FAQ API request:', error);
                        reject(error);
                    } else {
                        console.log('FAQ API Response:', body);
                        resolve(body);
                    }
                });
            });
            
            await context.sendActivity(response);
            await this.askFeedback(context);
        } catch (error) {
            console.error('Error processing FAQ API response:', error);
            await context.sendActivity('An error occurred while processing your request. Please try again later.');
        }
    }

    async callCLUAPI(context, query) {
        const options = {
            method: 'POST',
            url: 'https://dswinstance.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2022-10-01-preview',
            headers: {
                'Ocp-Apim-Subscription-Key': '681f9c6047a14f57ad6d7088ba19090a',
                'Apim-Request-Id': '4ffcac1c-b2fc-48ba-bd6d-b69d9942995a',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                kind: 'Conversation',
                analysisInput: {
                    conversationItem: {
                        id: 'PARTICIPANT_ID_HERE',
                        text: query,
                        modality: 'text',
                        language: 'en-US',
                        participantId: 'PARTICIPANT_ID_HERE'
                    }
                },
                parameters: {
                    projectName: 'clu',
                    verbose: true,
                    deploymentName: 'dep-1',
                    stringIndexType: 'TextElement_V8'
                }
            })
        };

        try {
            const response = await new Promise((resolve, reject) => {
                request(options, function (error, response, body) {
                    if (error) {
                        console.error('Error making CLU API request:', error);
                        reject(error);
                    } else {
                        console.log('CLU API Response:', body);
                        resolve(body);
                    }
                });
            });
            
            await context.sendActivity(response);
            await this.askFeedback(context);
        } catch (error) {
            console.error('Error processing CLU API response:', error);
            await context.sendActivity('An error occurred while processing your request. Please try again later.');
        }
    }

    async detectWeather(context, city) {
        const apiKey = 'MXOSWsg5MP7IXcpAykookYxmCOIb2D1u';
        const url = `https://api.tomorrow.io/v4/weather/realtime?location=${city}&apikey=${apiKey}`;
        
        try {
            const response = await new Promise((resolve, reject) => {
                request({ url, headers: { 'accept': 'application/json' } }, function (error, response, body) {
                    if (error) {
                        console.error('Error making weather API request:', error);
                        reject(error);
                    } else {
                        console.log('Weather API Response:', body);
                        resolve(body);
                    }
                });
            });
            
            await context.sendActivity(response);
            await this.askFeedback(context);
        } catch (error) {
            console.error('Error processing weather API response:', error);
            await context.sendActivity('An error occurred while processing your request. Please try again later.');
        }
    }

    async askFeedback(context) {
        const reply = MessageFactory.suggestedActions(["Yes", "No"], "Was this information helpful?");
        await context.sendActivity(reply);
        this.awaitingFeedback = true;
    }

    async handleFeedback(context, feedback) {
        if (feedback.toLowerCase() === 'yes') {
            await context.sendActivity("Thank you for your response. I'm glad I was able to help you.");
            await this.showNextSteps(context);
        } else if (feedback.toLowerCase() === 'no') {
            await context.sendActivity("Would you like to chat with the person in charge of the inquiry desk?\n【Reception hours】\n8:45~17:30 (excluding Saturdays, Sundays, national holidays and company holidays)");
            const reply = MessageFactory.suggestedActions(["Done for now", "Ask a Question", "Transfer to Agent"]);
            await context.sendActivity(reply);
            this.awaitingNextSteps = true;
        }
        this.awaitingFeedback = false;
    }

    async showNextSteps(context) {
        const reply = MessageFactory.suggestedActions(["Done for now", "Ask a Question"], "What would you like to do next?");
        await context.sendActivity(reply);
        this.awaitingNextSteps = true;
    }

    async handleNextSteps(context, nextStep) {
        if (nextStep.toLowerCase() === 'done for now') {
            await context.sendActivity("Thank you - Chat Ended");
        } else if (nextStep.toLowerCase() === 'ask a question') {
            await this.sendSuggestedActions(context);          
        } else if (nextStep.toLowerCase() === 'transfer to agent') {
            await context.sendActivity("The chat is being transferred to an agent.");
            // Handle transfer to agent logic here
        }
        this.awaitingNextSteps = false;
    }
}

module.exports.DSWBOT = DSWBOT;
